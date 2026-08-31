import type { ActionId, ProjectId } from '@/domain/ids/ids'
import type { RecordHome } from '@/domain/base/base'

/**
 * A project, its checklist, and what it is waiting on.
 *
 * Three things changed shape on the way over from a relational schema, and
 * each of them is a decision rather than a translation.
 *
 * **Actions are embedded, not a second table.** They exist only inside a
 * project, are always read with it, and are ordered relative to each other
 * — a foreign key bought nothing here that an array does not. The cost is
 * that two devices closing two different actions on the same project while
 * apart resolve as a whole-record winner, and one of the two closes is
 * lost. That is the same trade `synchronise.ts` already takes for a
 * workout, for the same reason: this is one person with a phone and a
 * desktop, not a team.
 *
 * **Blockers are a list of ids on the project, not a join table.** The
 * join existed because the store was relational. Here the whole graph is
 * in memory whenever anything asks a question about it.
 *
 * **Dates are calendar days where they mean calendar days.** `deadline`
 * and `availableFrom` are `YYYY-MM-DD`, because "the fifteenth" is a day
 * rather than an instant, and comparing days as ISO strings sorts
 * correctly without a timezone in the way. The bookkeeping stamps stay
 * full ISO timestamps.
 */

/**
 * Main or side, and nothing in between.
 *
 * A label about your attention rather than about the work: a side quest is
 * not smaller or easier, it is the one you are not currently making the
 * story about. Two kinds because one active of each is the whole point —
 * a third would need a third active slot and there is no question a third
 * answers.
 */
export const QUEST_KINDS = ['main', 'side'] as const
export type QuestKind = (typeof QUEST_KINDS)[number]

export const QUEST_KIND_LABELS: Readonly<Record<QuestKind, string>> = {
  main: 'Main',
  side: 'Side',
}

export const PROJECT_STATUSES = ['active', 'blocked', 'paused', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  active: 'Active',
  blocked: 'Blocked',
  paused: 'Paused',
  completed: 'Completed',
}

export const ACTION_STATUSES = ['pending', 'done'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

export interface ActionItem {
  readonly id: ActionId
  readonly description: string
  readonly status: ActionStatus
  readonly order: number
  /**
   * `YYYY-MM-DD`, or absent for "doable any time".
   *
   * Gates whether this action can be *recommended*, never whether it is
   * shown. A scheduled appointment is still part of the plan on the days
   * before it.
   */
  readonly availableFrom?: string
  readonly createdAt: string
  readonly completedAt?: string
  /**
   * Which kind of quest this belonged to when it was closed.
   *
   * Written at completion and never recomputed, because XP differs by kind
   * and the kind is a label you can change. Reading the quest's *current*
   * kind would mean promoting a side quest silently rewrote every hour you
   * had already logged against it — and demoting one would make your XP go
   * **down**, which a record of effort must never do.
   *
   * Same principle as a `WorkoutLog` embedding its own prescription: a log
   * describes itself, so history never needs the thing that produced it.
   */
  readonly completedAsKind?: QuestKind
}

export interface Project {
  readonly id: ProjectId
  readonly name: string
  readonly description?: string
  readonly category?: string
  /**
   * Where this thing lives on the web.
   *
   * Added for the job search, where it is load-bearing rather than a
   * convenience: an approved lead with no link has lost the form you
   * were going to fill in, which is the whole reason it was approved.
   *
   * **It is also the identity of an approved lead.** Two applications to
   * one posting is the mistake triage exists to prevent, and the apply
   * URL is the one thing about a posting that is unique and stable
   * across a re-read of the board — ids are per-board and a title
   * repeats across companies.
   *
   * Nothing else populates it yet, and a house job with a quote page is
   * the obvious second user.
   */
  readonly link?: string

  /** 1–10 each. Effort is floored at 1 in the engine, never here. */
  readonly impact: number
  readonly urgency: number
  readonly effort: number

  readonly status: ProjectStatus

  /**
   * Absent means side.
   *
   * Optional rather than required so records written before quests had
   * kinds read as side rather than as broken — which is also the right
   * default for a quest somebody added without thinking about it. Read it
   * through `kindOf`, never directly.
   */
  readonly kind?: QuestKind

  /**
   * When this was last made the active quest of its kind.
   *
   * A stamp rather than a boolean, and that is the load-bearing choice.
   * Two devices each activating a different quest while apart would both
   * set a boolean, and last-write-wins would leave two quests claiming to
   * be active with nothing to break the tie. A timestamp always has a
   * greatest element, so `activeQuest` picks a winner deterministically
   * however many stamps survive a merge.
   *
   * The write still tries to keep exactly one: activating clears the
   * others. The derivation is what makes it safe when that does not
   * survive the trip.
   */
  readonly activatedAt?: string

  /**
   * Blocked by something that is not another tracked project — "waiting on
   * the records office". Deliberately separate from `blockedBy`: one is a
   * fact about the world, the other is a fact about the graph, and the
   * recommendation treats them oppositely.
   */
  readonly isBlocked: boolean
  readonly blockReason?: string

  /** Projects that must complete before this one can move. */
  readonly blockedBy: readonly ProjectId[]

  /** `YYYY-MM-DD`, or absent. See `computeEffectiveUrgency`. */
  readonly deadline?: string

  readonly createdAt: string
  readonly completedAt?: string

  /**
   * Set when this belongs to Base rather than to its own area.
   *
   * Absent means the natural home, which is right for every record
   * written before Base existed and for anything added without thinking
   * about it. Read it through `isBase` / `isOwnArea` in
   * `domain/base/base.ts` rather than comparing here — the two halves are
   * named so a screen listing this type has to choose a side, and the
   * failure is silent in one direction: forget to exclude Base and the
   * record shows up in two places at once.
   */
  readonly belongsTo?: RecordHome

  readonly actions: readonly ActionItem[]

  /** Written by the repository on save. See `domain/backlog/item.ts`. */
  readonly updatedAt?: string
}

/** Projects by id, which every graph question here needs. */
export function indexProjects(projects: readonly Project[]): ReadonlyMap<ProjectId, Project> {
  return new Map(projects.map((project) => [project.id, project]))
}
