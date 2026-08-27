import type { ActionId, ProjectId } from '@/domain/ids/ids'

import type { ActionItem, Project, ProjectStatus } from './project'

/**
 * What to work on next, and why.
 *
 * Every rule the quest log exists to enforce lives here, as pure functions
 * over records already in memory. The original was a static C# class with
 * the same property, and it is the reason this port was safe: its 358
 * lines of tests came across with it.
 *
 * One thing that did not come across is the wall clock. The original read
 * `DateTime.Now.Date` inside the urgency ramp, which made the ramp
 * untestable at a chosen date — every test asserting on it had to be
 * written relative to whenever it happened to run. Every function that
 * needs today takes it.
 */

/**
 * How many days out a deadline starts pulling urgency toward 10.
 *
 * Fixed rather than proportional to how far out the deadline originally
 * was: it should behave the same whether the date was set two weeks or six
 * months ahead, because it only ever matters once things get close.
 */
export const DEADLINE_RAMP_DAYS = 14

/** A `YYYY-MM-DD` key for the local calendar day a moment falls on. */
export function toDayKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Whole days from one calendar day to another.
 *
 * Both keys go through a local `Date` at midnight rather than being
 * subtracted as strings, so months, years, leap days and daylight-saving
 * shifts — where a day is not 24 hours long — all come out right.
 */
export function daysBetween(from: string, to: string): number {
  const parse = (key: string): Date => {
    const [year, month, day] = key.split('-').map(Number)
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  }

  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000)
}

/**
 * Urgency after the deadline has had its say.
 *
 * No deadline: exactly the number that was set by hand. With one: ramps
 * linearly from that number up to 10 across the final
 * `DEADLINE_RAMP_DAYS`, and pins at 10 once due or overdue.
 *
 * It only ever pushes urgency **up**. A hand-set 10 is untouched, and
 * something that feels minor day to day is still forced to the top as a
 * real external date arrives.
 */
export function computeEffectiveUrgency(project: Project, today: Date): number {
  if (project.deadline === undefined) return project.urgency

  const daysRemaining = daysBetween(toDayKey(today), project.deadline)
  if (daysRemaining <= 0) return 10
  if (daysRemaining >= DEADLINE_RAMP_DAYS) return project.urgency

  const progress = (DEADLINE_RAMP_DAYS - daysRemaining) / DEADLINE_RAMP_DAYS
  return project.urgency + (10 - project.urgency) * progress
}

/**
 * `(impact × effective urgency) / effort`, rounded.
 *
 * Effort is floored at 1 here rather than validated on the way in, so a
 * record written straight into the database cannot divide by zero.
 *
 * **Rounding differs from the original by design.** C#'s `Math.Round`
 * is banker's rounding, so an exact 2.5 became 2; JavaScript rounds half
 * away from zero, so it becomes 3. Reproducing banker's rounding would
 * mean a helper nobody can read guarding a case that only ever shifts a
 * score by one — and a one-point difference is settled by the urgency
 * tie-break below. Recorded here, and pinned by a test, because a silent
 * change to a scoring rule is exactly what porting an engine risks.
 */
export function computeScore(project: Project, today: Date): number {
  const effort = Math.max(project.effort, 1)
  return Math.round((project.impact * computeEffectiveUrgency(project, today)) / effort)
}

/**
 * Whether this project is waiting on another tracked project that has not
 * finished.
 *
 * Distinct from `isBlocked`, which covers blocks that are not other
 * tracked projects. The recommendation treats the two oppositely, so
 * collapsing them would be the end of the most useful rule in the app.
 */
export function isBlockedByOpenProjects(
  project: Project,
  byId: ReadonlyMap<ProjectId, Project>,
): boolean {
  return project.blockedBy.some((id) => {
    const blocker = byId.get(id)
    return blocker !== undefined && blocker.status !== 'completed'
  })
}

/**
 * The blocked/active derivation, in one place.
 *
 * Completed and paused are explicit choices a person made and pass
 * through untouched. Everything else is derived: blocked if the manual
 * flag is set, or if it is waiting on another open project.
 */
export function deriveStatus(
  project: Project,
  requested: ProjectStatus,
  byId: ReadonlyMap<ProjectId, Project>,
): ProjectStatus {
  if (requested === 'completed' || requested === 'paused') return requested

  return project.isBlocked || isBlockedByOpenProjects(project, byId) ? 'blocked' : 'active'
}

/**
 * Progress, derived from the checklist rather than tracked by hand.
 *
 * A completed project always reads 100 — it may have been closed with the
 * button before every action was ticked, and reading 33% at that point
 * would be the record arguing with the person who wrote it.
 */
export function computeProgress(project: Project): number {
  if (project.status === 'completed') return 100
  if (project.actions.length === 0) return 0

  const done = project.actions.filter((action) => action.status === 'done').length
  return Math.round((100 * done) / project.actions.length)
}

/** The lowest-ordered action still pending. */
export function currentNextAction(project: Project): ActionItem | undefined {
  return project.actions
    .filter((action) => action.status === 'pending')
    .sort((a, b) => a.order - b.order)[0]
}

/**
 * Whether an action can be worked on today.
 *
 * An action with no date is doable any time. One dated in the future is
 * still visible and still part of the plan — it is simply not the thing to
 * do this morning.
 */
export function isEligibleNow(action: ActionItem | undefined, today: Date): boolean {
  if (action === undefined) return false
  return action.availableFrom === undefined || action.availableFrom <= toDayKey(today)
}

/**
 * Everything still in play, best first.
 *
 * Score descending, then effective urgency, then oldest first — so two
 * projects that score the same do not leave the older one quietly rotting
 * at the bottom.
 */
export function rankActiveProjects(projects: readonly Project[], today: Date): readonly Project[] {
  return projects
    .filter((project) => project.status === 'active' || project.status === 'blocked')
    .toSorted((a, b) => {
      const byScore = computeScore(b, today) - computeScore(a, today)
      if (byScore !== 0) return byScore

      const byUrgency = computeEffectiveUrgency(b, today) - computeEffectiveUrgency(a, today)
      if (byUrgency !== 0) return byUrgency

      return a.createdAt.localeCompare(b.createdAt)
    })
}

export interface Recommendation {
  readonly projectId?: ProjectId
  readonly projectName?: string
  readonly actionId?: ActionId
  readonly actionDescription?: string
  /** Always present, including when there is nothing to recommend. */
  readonly reason: string
}

/**
 * The single thing to do next, and the sentence explaining why.
 *
 * Walking the ranked list rather than taking the top of it, because the
 * best project is often not the actionable one:
 *
 *   - Waiting on another **tracked project**? Skip it unconditionally. Its
 *     own next step does not release it — finishing the other project
 *     does — so recommending it would be telling you to do the wrong
 *     thing, and the other project will surface on its own merits.
 *   - Blocked by something **outside** the app? Recommend it anyway. Its
 *     next action *is* the unblock step, and doing it releases a
 *     high-value project.
 *   - Next action not available until Thursday, or not defined at all?
 *     Not actionable today. Move down the list.
 *
 * When nothing qualifies it returns an explanation rather than a row of
 * nulls, because "nothing to do" and "something went wrong" must not look
 * the same on a screen you open every morning.
 */
export function getRecommendation(projects: readonly Project[], today: Date): Recommendation {
  const byId = new Map(projects.map((project) => [project.id, project]))

  for (const project of rankActiveProjects(projects, today)) {
    if (isBlockedByOpenProjects(project, byId)) continue

    const nextAction = currentNextAction(project)
    if (!isEligibleNow(nextAction, today) || nextAction === undefined) continue

    return {
      projectId: project.id,
      projectName: project.name,
      actionId: nextAction.id,
      actionDescription: nextAction.description,
      reason:
        project.status === 'blocked'
          ? 'Unblocks a high-priority quest'
          : 'Highest priority active quest',
    }
  }

  return {
    reason:
      'Nothing actionable right now. Add a next step to a blocked quest, add a new quest, or check back once a waiting item’s date arrives.',
  }
}
