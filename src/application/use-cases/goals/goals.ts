import {
  addItem,
  answerQuestion,
  completeItem,
  confirmHypothesis,
  decideItem,
  linkToProject,
  refuteHypothesis,
  removeItem,
  renameGoal,
  renameItem,
  renameWorkstream,
  reopenItem,
  setDependencies,
  standingFor,
  unlinkFromProject,
  validateDependency,
  type Goal,
  type GoalItem,
  type GoalItemKind,
  type GoalStanding,
  type LinkedProjectInfo,
} from '@/domain/goals/goal'
import type { GoalId, GoalItemId, IdGenerator, ProjectId } from '@/domain/ids/ids'
import type { Project } from '@/domain/projects/project'
import type { Clock, GoalRepository, ProjectRepository } from '@/domain/repositories/ports'

/**
 * A complex goal, read and edited the way a campaign is: nothing here
 * awards XP, for the reason `domain/goals/goal.ts` states at the top — a
 * decision or a ruled-out hypothesis is not an act, and paying for it
 * would be the outcome/act line crossed for something that is not
 * repeatable and not really a "thing done" at all.
 */

export interface GoalDeps {
  readonly goals: GoalRepository
  /**
   * Read for one reason: a linked item's resolution follows its quest
   * live, the same "evidence gathered live, never copied" stance
   * `CampaignDeps` already takes on Base and Jobs. Nothing here is
   * written back onto a project.
   */
  readonly projects: ProjectRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

/** Every quest, keyed by id, for whatever a linked goal item needs to know about it. */
async function linkedProjectIndex(
  deps: GoalDeps,
): Promise<ReadonlyMap<ProjectId, LinkedProjectInfo>> {
  const projects = await deps.projects.all()
  return new Map(
    projects.map((project) => [
      project.id,
      { id: project.id, name: project.name, completed: project.status === 'completed' },
    ]),
  )
}

export async function goalStandings(deps: GoalDeps): Promise<readonly GoalStanding[]> {
  const [goals, linkedProjects] = await Promise.all([deps.goals.all(), linkedProjectIndex(deps)])
  return goals
    .map((goal) => standingFor(goal, linkedProjects))
    .sort((a, b) => a.goal.createdAt.localeCompare(b.goal.createdAt))
}

export async function goalStanding(id: GoalId, deps: GoalDeps): Promise<GoalStanding | undefined> {
  const [goal, linkedProjects] = await Promise.all([deps.goals.byId(id), linkedProjectIndex(deps)])
  return goal === undefined ? undefined : standingFor(goal, linkedProjects)
}

/** Quests an action or milestone could be linked to, for a picker to list. */
export async function linkableProjects(deps: GoalDeps): Promise<readonly Project[]> {
  const projects = await deps.projects.all()
  return [...projects].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * An item offered at creation, without dependencies.
 *
 * The same split `NewProject` makes between its `steps` and its
 * `blockedBy`: a batch of items can be named up front, and the edges
 * between them are added afterwards through `setDependenciesIn`, once
 * every item has a real id to point at. Building a graph with
 * forward-referencing dependencies in one call would need invented
 * placeholder ids, which is worse than asking for two calls.
 */
export interface NewGoalItem {
  readonly workstream: string
  readonly kind: GoalItemKind
  readonly title: string
  readonly notes?: string
}

export interface NewGoal {
  readonly name: string
  readonly aim?: string
  readonly items?: readonly NewGoalItem[]
}

/**
 * Creates a goal with its opening items, in one write — the reason a
 * house job's steps arrive with it rather than through a second call:
 * several sequential writes is several chances to leave a half-built
 * record behind.
 */
export async function addGoal(
  input: NewGoal,
  deps: GoalDeps,
): Promise<{ readonly error?: string; readonly goal?: Goal }> {
  const name = input.name.trim()
  if (name === '') return { error: 'A goal needs a name.' }

  const aim = input.aim?.trim() ?? ''
  const now = deps.clock.now().toISOString()

  const goal: Goal = {
    id: deps.ids.next() as GoalId,
    name,
    ...(aim === '' ? {} : { aim }),
    items: (input.items ?? []).flatMap((item) => {
      const title = item.title.trim()
      if (title === '') return []

      const workstream = item.workstream.trim() || 'General'
      const notes = item.notes?.trim() ?? ''

      return [
        {
          id: deps.ids.next() as GoalItemId,
          workstream,
          kind: item.kind,
          title,
          ...(notes === '' ? {} : { notes }),
          dependsOn: [],
          createdAt: now,
        },
      ]
    }),
    createdAt: now,
  }

  await deps.goals.save(goal)
  return { goal }
}

/** Adds one item to an existing goal. Never a cycle risk: nothing can already point at an id that did not exist a moment ago. */
export async function addItemTo(
  id: GoalId,
  input: NewGoalItem,
  deps: GoalDeps,
): Promise<{ readonly error?: string; readonly item?: GoalItem }> {
  const title = input.title.trim()
  if (title === '') return { error: 'An item needs a title.' }

  const goal = await deps.goals.byId(id)
  if (goal === undefined) return { error: 'That goal no longer exists.' }

  const workstream = input.workstream.trim() || 'General'
  const notes = input.notes?.trim() ?? ''

  const item: GoalItem = {
    id: deps.ids.next() as GoalItemId,
    workstream,
    kind: input.kind,
    title,
    ...(notes === '' ? {} : { notes }),
    dependsOn: [],
    createdAt: deps.clock.now().toISOString(),
  }

  await deps.goals.save(addItem(goal, item))
  return { item }
}

/** Sets which items an item hard-depends on, refusing anything that would close a loop. */
export async function setDependenciesIn(
  id: GoalId,
  itemId: GoalItemId,
  dependsOn: readonly GoalItemId[],
  deps: GoalDeps,
): Promise<{ readonly error?: string }> {
  const goal = await deps.goals.byId(id)
  if (goal === undefined) return {}

  const ids = [...new Set(dependsOn)]
  for (const dependsOnId of ids) {
    const error = validateDependency(goal.items, itemId, dependsOnId)
    if (error !== undefined) return { error }
  }

  const next = setDependencies(goal, itemId, ids)
  if (next !== goal) await deps.goals.save(next)
  return {}
}

export async function decideItemIn(
  id: GoalId,
  itemId: GoalItemId,
  decidedAs: string,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) =>
    decideItem(goal, itemId, decidedAs, deps.clock.now().toISOString()),
  )
}

export async function confirmHypothesisIn(
  id: GoalId,
  itemId: GoalItemId,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) =>
    confirmHypothesis(goal, itemId, deps.clock.now().toISOString()),
  )
}

export async function refuteHypothesisIn(
  id: GoalId,
  itemId: GoalItemId,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => refuteHypothesis(goal, itemId, deps.clock.now().toISOString()))
}

export async function answerQuestionIn(
  id: GoalId,
  itemId: GoalItemId,
  answeredAs: string,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) =>
    answerQuestion(goal, itemId, answeredAs, deps.clock.now().toISOString()),
  )
}

export async function completeItemIn(
  id: GoalId,
  itemId: GoalItemId,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => completeItem(goal, itemId, deps.clock.now().toISOString()))
}

/** Points an item at a real quest. Resolution follows the quest from here — see `standingFor`. */
export async function linkItemToProjectIn(
  id: GoalId,
  itemId: GoalItemId,
  projectId: ProjectId,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => linkToProject(goal, itemId, projectId))
}

export async function unlinkItemFromProjectIn(
  id: GoalId,
  itemId: GoalItemId,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => unlinkFromProject(goal, itemId))
}

/** An item's title, workstream and notes, in one write. See `renameItem`. */
export async function renameItemIn(
  id: GoalId,
  itemId: GoalItemId,
  title: string,
  workstream: string,
  notes: string,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => renameItem(goal, itemId, title, workstream, notes))
}

/** Renames a workstream across every item that carries it. See `renameWorkstream`. */
export async function renameWorkstreamIn(
  id: GoalId,
  from: string,
  to: string,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => renameWorkstream(goal, from, to))
}

/** Undoes whichever resolution an item carries — a decision revisited, a hypothesis reopened, a step unticked. */
export async function reopenItemIn(id: GoalId, itemId: GoalItemId, deps: GoalDeps): Promise<void> {
  await editGoal(id, deps, (goal) => reopenItem(goal, itemId))
}

/** Removes an item and every dependency pointing at it. Destructive, named apart from the rest. */
export async function removeItemFrom(
  id: GoalId,
  itemId: GoalItemId,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => removeItem(goal, itemId))
}

export async function renameGoalIn(
  id: GoalId,
  name: string,
  aim: string,
  deps: GoalDeps,
): Promise<void> {
  await editGoal(id, deps, (goal) => renameGoal(goal, name, aim))
}

export async function removeGoal(id: GoalId, deps: GoalDeps): Promise<void> {
  await deps.goals.remove(id)
}

/**
 * Clears a deleted quest's id from every goal item that pointed at it.
 *
 * The cascade `withoutBlocker` runs for a deleted quest's own blockers,
 * arriving at the one reference `deleteProject` cannot clear itself: it
 * lives in a different repository, one `application/projects` must not
 * import. `standingFor` already reads a missing project as unlinked, so
 * a dangling id was never a *correctness* bug — but it would sit in the
 * record forever, travel over sync, and leave the item's own "Unlink"
 * control unreachable, since that control only shows for a link that
 * still resolves to something.
 */
export async function unlinkProjectEverywhere(projectId: ProjectId, deps: GoalDeps): Promise<void> {
  const goals = await deps.goals.all()

  await Promise.all(
    goals.flatMap((goal) => {
      const touched = goal.items.filter((item) => item.linkedProjectId === projectId)
      if (touched.length === 0) return []

      const cleared = touched.reduce((current, item) => unlinkFromProject(current, item.id), goal)
      return [deps.goals.save(cleared)]
    }),
  )
}

async function editGoal(id: GoalId, deps: GoalDeps, change: (goal: Goal) => Goal): Promise<void> {
  const goal = await deps.goals.byId(id)
  if (goal === undefined) return

  const next = change(goal)
  // Identity means nothing changed, so no write and no `updatedAt` churn
  // that would make this device look newer than one that really did.
  if (next === goal) return

  await deps.goals.save(next)
}
