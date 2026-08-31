import { keepFor, type HomeFilter, type RecordHome } from '@/domain/base/base'
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
  /**
   * Which area it belongs to, absent meaning the quest log.
   *
   * Here so a house job can be *created* on Base rather than created in
   * the quest log and moved afterwards. That round trip was the friction
   * already removed from chores and from upgrades, and left in place
   * here — the third instance of the same shape, found the same way.
   */
  readonly belongsTo?: RecordHome
  /**
   * Steps to open it with, in order.
   *
   * Written in the same save as the project rather than added one call
   * at a time: three sequential `addAction` writes is three chances for
   * a half-built job to be left behind, and `saveAndSettle` exists
   * precisely because a partial write leaves the graph lying.
   */
  readonly steps?: readonly string[]
  /** Where it lives on the web — see `Project.link`. */
  readonly link?: string
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
    ...(input.belongsTo === undefined ? {} : { belongsTo: input.belongsTo }),
    ...(input.link === undefined || input.link === '' ? {} : { link: input.link }),
    createdAt: now,
    actions: (input.steps ?? []).map((description, index) => ({
      id: asActionId(deps.ids.next()),
      description: description.trim(),
      status: 'pending' as const,
      // One-based, matching `addAction`, which places a new step at
      // one past the highest already there.
      order: index + 1,
      createdAt: now,
    })),
  }

  return saveAndSettle(project, deps)
}

/**
 * Files a one-off: a quest whose whole content is one step.
 *
 * **Born with its step, in one write.** A contract with no actions would
 * pay nothing at all — XP comes from `projects.side-action-closed` and
 * nothing pays for a project existing — so creating it empty and hoping
 * a step gets added later is how the section fills with things that earn
 * nothing. `addProject` already takes `steps`, so this is one call and
 * one record, which is also what stops a half-built contract being left
 * behind.
 *
 * The step is named after the contract, because for a one-off they are
 * the same thing and the history should read that way: "closed a side
 * quest step — return the parcel" is what happened.
 *
 * **Side, not main.** A one-off is by definition not the thing you are
 * working towards, and `completedAsKind` prices it at 20 rather than 40
 * at the moment it closes.
 */
export async function addContract(name: string, deps: ProjectDeps): Promise<Project | undefined> {
  const trimmed = name.trim()
  if (trimmed === '') return undefined

  return addProject({ name: trimmed, kind: 'side', steps: [trimmed] }, deps)
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

/**
 * What the scoring would pick, out of one area's projects.
 *
 * **The filter is required, like `listProjects`, and for the reason that
 * rule was written.** This read `projects.all()` and scored across every
 * home, so the Quests page's "Suggested" panel offered a leaking tap as
 * the next thing to work on — a house job recommended as a quest,
 * described as "highest priority active quest", on the one screen Base
 * exists to keep house work off.
 *
 * It hid because the board beside it filters correctly, so the job was
 * absent from the list and present in the suggestion above it, which
 * reads as a quirk rather than as the same bug twice.
 */
export async function recommendation(deps: ProjectDeps, home: HomeFilter): Promise<Recommendation> {
  return getRecommendation(keepFor(await deps.projects.all(), home), deps.clock.now())
}

/**
 * Moves a record between Base and its own area.
 *
 * A *move*, not a create-and-delete, and that is the whole reason this
 * exists rather than a checkbox on the add form. The common case is a
 * quest log that has quietly filled up with house work — the leaking tap
 * has been on the list for a month, with its steps and its history — and
 * retyping it into a new home would throw away the part that took effort
 * to record.
 *
 * One field changes. Nothing about the record's identity, steps or
 * completions moves with it, so XP already earned stays earned in
 * whichever area paid it: `tallyActs` reads the *current* home, and a
 * quest moved to Base today stops paying `projects.*` from today. That is
 * the honest reading of a reclassification — you have not un-done the
 * work, you have changed what it is filed under — and it is the same
 * trade `completedAsKind` makes for main and side quests, in the other
 * direction, for the same reason.
 */
export async function moveProjectHome(
  id: ProjectId,
  home: RecordHome | undefined,
  deps: ProjectDeps,
): Promise<Project> {
  const existing = await require(id, deps)
  const { belongsTo: _dropped, ...rest } = existing
  const moved: Project = home === undefined ? rest : { ...rest, belongsTo: home }

  await deps.projects.save(moved)

  return moved
}

export async function listProjects(
  deps: ProjectDeps,
  home: HomeFilter,
): Promise<readonly Project[]> {
  return keepFor(await deps.projects.all(), home)
}

export { dependentsOf }
