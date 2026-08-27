import { activate, activeQuest, kindOf, standDown } from '@/domain/projects/active'
import {
  asActionId,
  asProjectId,
  type ActionId,
  type IdGenerator,
  type ProjectId,
} from '@/domain/ids/ids'
import {
  dependentsOf,
  recomputeStatuses,
  validateBlockers,
  withoutBlocker,
} from '@/domain/projects/blocking'
import { deriveStatus, getRecommendation, type Recommendation } from '@/domain/projects/priority'
import {
  indexProjects,
  type ActionItem,
  type Project,
  type ProjectStatus,
  type QuestKind,
} from '@/domain/projects/project'
import type { Clock, ProjectRepository } from '@/domain/repositories/ports'

/**
 * The quest log's operations.
 *
 * Every one of them ends by re-deriving blocked/active across the whole
 * graph and saving whatever moved. The original did this after a status
 * change only, against a named set of dependents, because reading every
 * project was a query. Here the list is already loaded, so recomputing all
 * of it costs nothing — and removes the question that version had to keep
 * answering correctly: *which* projects need revisiting.
 */

export interface ProjectDeps {
  readonly projects: ProjectRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface NewProject {
  readonly name: string
  readonly description?: string
  readonly impact?: number
  readonly urgency?: number
  readonly effort?: number
  readonly deadline?: string
  readonly kind?: QuestKind
  readonly isBlocked?: boolean
  readonly blockReason?: string
  readonly blockedBy?: readonly ProjectId[]
}

/**
 * Saves a project and everything its arrival changed.
 *
 * `saveMany` rather than a save followed by more saves: completing one
 * project can un-block several others, and a partial write leaves the
 * graph claiming a project is blocked by something already finished.
 */
async function saveAndSettle(project: Project, deps: ProjectDeps): Promise<Project> {
  const others = (await deps.projects.all()).filter((one) => one.id !== project.id)
  const all = [...others, project]

  const byId = indexProjects(all)
  const settled: Project = { ...project, status: deriveStatus(project, project.status, byId) }

  const moved = recomputeStatuses([...others, settled]).filter((one) => one.id !== settled.id)

  await deps.projects.saveMany([settled, ...moved])
  return settled
}

export async function addProject(input: NewProject, deps: ProjectDeps): Promise<Project> {
  const now = deps.clock.now().toISOString()

  const project: Project = {
    id: asProjectId(deps.ids.next()),
    name: input.name.trim(),
    ...(input.description === undefined ? {} : { description: input.description }),
    impact: input.impact ?? 5,
    urgency: input.urgency ?? 5,
    effort: input.effort ?? 5,
    status: 'active',
    // Side unless said otherwise: a main quest is a deliberate choice, and
    // most things get added without one being made.
    kind: input.kind ?? 'side',
    isBlocked: input.isBlocked ?? false,
    ...(input.blockReason === undefined ? {} : { blockReason: input.blockReason }),
    blockedBy: input.blockedBy ?? [],
    ...(input.deadline === undefined ? {} : { deadline: input.deadline }),
    createdAt: now,
    actions: [],
  }

  return saveAndSettle(project, deps)
}

async function require(id: ProjectId, deps: ProjectDeps): Promise<Project> {
  const existing = await deps.projects.byId(id)
  if (existing === undefined) throw new Error(`No project found with id ${id}.`)
  return existing
}

export interface ProjectChanges {
  readonly name?: string
  readonly description?: string
  readonly impact?: number
  readonly urgency?: number
  readonly effort?: number
  readonly deadline?: string | null
  readonly isBlocked?: boolean
  readonly blockReason?: string | null
  readonly status?: ProjectStatus
}

export async function updateProject(
  id: ProjectId,
  changes: ProjectChanges,
  deps: ProjectDeps,
): Promise<Project> {
  const existing = await require(id, deps)
  const requested = changes.status ?? existing.status

  const completing = requested === 'completed' && existing.status !== 'completed'

  const { deadline: _deadline, blockReason: _blockReason, ...rest } = existing
  const updated: Project = {
    ...rest,
    ...(changes.name === undefined ? {} : { name: changes.name.trim() }),
    ...(changes.description === undefined ? {} : { description: changes.description }),
    ...(changes.impact === undefined ? {} : { impact: changes.impact }),
    ...(changes.urgency === undefined ? {} : { urgency: changes.urgency }),
    ...(changes.effort === undefined ? {} : { effort: changes.effort }),
    ...(changes.isBlocked === undefined ? {} : { isBlocked: changes.isBlocked }),
    status: requested,
    // `null` clears; absent leaves alone. Two different requests, so two
    // different values — an absent field must never mean "remove it".
    ...(changes.deadline === null ? {} : { deadline: changes.deadline ?? existing.deadline }),
    ...(changes.blockReason === null
      ? {}
      : { blockReason: changes.blockReason ?? existing.blockReason }),
    ...(completing ? { completedAt: deps.clock.now().toISOString() } : {}),
  }

  return saveAndSettle(dropUndefined(updated), deps)
}

/**
 * Strips keys that a conditional spread left as `undefined`.
 *
 * `exactOptionalPropertyTypes` means an explicit `undefined` is not the
 * same as an absent key, and IndexedDB stores the difference — so a
 * project that once had a deadline would come back with `deadline:
 * undefined` and read as having one until something looked closely.
 */
function dropUndefined(project: Project): Project {
  return Object.fromEntries(
    Object.entries(project).filter(([, value]) => value !== undefined),
  ) as unknown as Project
}

/**
 * Sets what a project is waiting on, refusing anything that closes a loop.
 *
 * Validation returns a message rather than throwing, because every way to
 * get this wrong is something a person did on purpose and needs told back
 * to them.
 */
export async function setBlockers(
  id: ProjectId,
  blockerIds: readonly ProjectId[],
  deps: ProjectDeps,
): Promise<{ readonly project?: Project; readonly error?: string }> {
  const all = await deps.projects.all()

  const error = validateBlockers(all, id, blockerIds)
  if (error !== undefined) return { error }

  const existing = await require(id, deps)
  const project = await saveAndSettle({ ...existing, blockedBy: [...new Set(blockerIds)] }, deps)

  return { project }
}

/**
 * Deletes a project, and takes every reference to it with it.
 *
 * The relational schema did the second half on cascade delete. Without it
 * a dangling id sits in every dependent's record, travels over sync, and
 * comes back to life if a later project is ever created with the same id.
 * Captured before the delete, because after it there is nothing to ask.
 */
export async function deleteProject(id: ProjectId, deps: ProjectDeps): Promise<void> {
  const survivors = (await deps.projects.all()).filter((project) => project.id !== id)

  await deps.projects.remove(id)

  // Only the ones that referenced it come back changed.
  const stripped = new Map(withoutBlocker(survivors, id).map((project) => [project.id, project]))
  const graph = survivors.map((project) => stripped.get(project.id) ?? project)

  // Losing a blocker can un-block something, so statuses are re-derived
  // against the graph as it now stands rather than as it was.
  const moved = new Map(recomputeStatuses(graph).map((project) => [project.id, project]))

  const changed = graph
    .filter((project) => stripped.has(project.id) || moved.has(project.id))
    .map((project) => moved.get(project.id) ?? project)

  if (changed.length > 0) await deps.projects.saveMany(changed)
}

export async function addAction(
  id: ProjectId,
  description: string,
  availableFrom: string | undefined,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await require(id, deps)

  const action: ActionItem = {
    id: asActionId(deps.ids.next()),
    description: description.trim(),
    status: 'pending',
    // One past the highest, so a new step lands at the bottom of the list
    // rather than fighting an existing one for a position.
    order: Math.max(0, ...project.actions.map((one) => one.order)) + 1,
    ...(availableFrom === undefined ? {} : { availableFrom }),
    createdAt: deps.clock.now().toISOString(),
  }

  return saveAndSettle({ ...project, actions: [...project.actions, action] }, deps)
}

/**
 * Closes an action, or re-opens one closed by mistake.
 *
 * Closing does not complete the project even when it was the last step —
 * finishing a checklist and declaring a project done are two different
 * claims, and the second is a decision. `computeProgress` will read 100%
 * and the project will still be open, which is the honest state.
 */
export async function setActionStatus(
  id: ProjectId,
  actionId: ActionId,
  done: boolean,
  deps: ProjectDeps,
): Promise<Project> {
  const project = await require(id, deps)

  const actions = project.actions.map((action) => {
    if (action.id !== actionId) return action

    const { completedAt: _was, completedAsKind: _wasKind, ...rest } = action
    return done
      ? {
          ...rest,
          status: 'done' as const,
          completedAt: deps.clock.now().toISOString(),
          /*
           * Stamped now and never recomputed. XP differs by kind and the
           * kind is a label you can change, so reading the quest's
           * *current* kind would let promoting a side quest rewrite every
           * action already closed against it — and demoting one would make
           * XP go **down**, which a record of effort must never do.
           */
          completedAsKind: kindOf(project),
        }
      : { ...rest, status: 'pending' as const }
  })

  return saveAndSettle({ ...project, actions }, deps)
}

/**
 * Makes a quest the active one of its kind, or stands the kind down.
 *
 * Writes every record the change touched in one go — the newly active one
 * and whichever was active before. `activeQuest` would resolve the answer
 * even if the second write were lost, which is the point of deriving it
 * from a stamp; clearing the old one keeps the stored state matching what
 * a person would expect to find.
 */
export async function setActiveQuest(
  id: ProjectId | undefined,
  kind: QuestKind,
  deps: ProjectDeps,
): Promise<void> {
  const projects = await deps.projects.all()
  const changed =
    id === undefined
      ? standDown(projects, kind)
      : activate(projects, id, deps.clock.now().toISOString())

  if (changed.length > 0) await deps.projects.saveMany(changed)
}

export async function activeQuests(
  deps: ProjectDeps,
): Promise<{ readonly main?: Project; readonly side?: Project }> {
  const projects = await deps.projects.all()
  const main = activeQuest(projects, 'main')
  const side = activeQuest(projects, 'side')

  return {
    ...(main === undefined ? {} : { main }),
    ...(side === undefined ? {} : { side }),
  }
}

export async function recommendation(deps: ProjectDeps): Promise<Recommendation> {
  return getRecommendation(await deps.projects.all(), deps.clock.now())
}

export async function listProjects(deps: ProjectDeps): Promise<readonly Project[]> {
  return deps.projects.all()
}

export { dependentsOf }
