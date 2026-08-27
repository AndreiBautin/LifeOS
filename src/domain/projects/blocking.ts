import type { ProjectId } from '@/domain/ids/ids'

import { deriveStatus } from './priority'
import { indexProjects, type Project } from './project'

/**
 * The dependency graph: what may block what, and what falls out when
 * something completes.
 *
 * This was a service over the database. Every question it answered — is
 * this a cycle, who is waiting on that, which statuses changed — was a
 * query, and the guard against a circular chain existed in the schema as
 * well as in the code. Neither half of that survives a move to IndexedDB,
 * so the code half becomes the only one, and it stops being asynchronous:
 * the whole graph is a few dozen records already in memory.
 *
 * Everything here is pure and returns new records. Writing them is the
 * repository's job.
 */

/**
 * Whether `from` already depends on `target`, directly or through a chain.
 *
 * A breadth-first walk with a visited set, so a graph that is already
 * corrupt — a cycle written by an older build, or by two devices agreeing
 * on halves of one — terminates rather than hanging the page.
 */
export function dependsOn(
  byId: ReadonlyMap<ProjectId, Project>,
  from: ProjectId,
  target: ProjectId,
): boolean {
  const visited = new Set<ProjectId>()
  const queue: ProjectId[] = [from]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visited.has(current)) continue
    visited.add(current)

    if (current === target) return true

    const project = byId.get(current)
    if (project !== undefined) queue.push(...project.blockedBy)
  }

  return false
}

/**
 * Why a proposed set of blockers cannot be applied, or `undefined` if it
 * can.
 *
 * A message rather than a thrown error, because every one of these is
 * something a person did on purpose and needs told back to them — this is
 * the difference between "that would create a circular dependency" and a
 * form that refuses to submit.
 */
export function validateBlockers(
  projects: readonly Project[],
  projectId: ProjectId,
  blockerIds: readonly ProjectId[],
): string | undefined {
  const ids = [...new Set(blockerIds)]
  if (ids.length === 0) return undefined

  if (ids.includes(projectId)) return 'A quest cannot block itself.'

  const byId = indexProjects(projects)

  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length > 0) return `Unknown project: ${missing.join(', ')}.`

  for (const blockerId of ids) {
    // If the blocker already depends on this project, adding "this project
    // depends on the blocker" closes the loop.
    if (dependsOn(byId, blockerId, projectId)) {
      return 'That would create a circular dependency between quests.'
    }
  }

  return undefined
}

/** Ids of the projects currently waiting on this one. */
export function dependentsOf(
  projects: readonly Project[],
  projectId: ProjectId,
): readonly ProjectId[] {
  return projects
    .filter((project) => project.blockedBy.includes(projectId))
    .map((project) => project.id)
}

/**
 * Re-derives blocked/active across the whole graph, returning only what
 * changed.
 *
 * The original recomputed a named set of dependents after a status moved,
 * because reading every project was a query and reading a few was cheaper.
 * Here the whole list is already loaded, so recomputing all of it costs
 * nothing and removes the question that version had to keep answering:
 * *which* projects need revisiting. A project un-blocks the moment its
 * last blocker completes, with no manual step, and no path can forget to
 * ask.
 *
 * Returning changes rather than a full list is what keeps the write small:
 * saving every project on every status change would restamp records that
 * did not move, and a restamped record is one that travels over sync
 * claiming to be news.
 */
export function recomputeStatuses(projects: readonly Project[]): readonly Project[] {
  const byId = indexProjects(projects)

  return projects.flatMap((project) => {
    // Completed and paused are explicit choices. Nothing derives over them.
    if (project.status === 'completed' || project.status === 'paused') return []

    const derived = deriveStatus(project, project.status, byId)
    return derived === project.status ? [] : [{ ...project, status: derived }]
  })
}

/**
 * Every project with a reference to a deleted one stripped out.
 *
 * The relational schema did this on cascade delete, which is the kind of
 * thing that is invisible until it is gone: without it, deleting a blocker
 * leaves every project that was waiting on it pointing at a row that no
 * longer exists. `isBlockedByOpenProjects` treats a dangling id as no
 * blocker at all, so nothing would be *stuck* — but the reference would
 * sit in the record forever, travel over sync, and reappear as a blocker
 * the moment some other project was created with the same id.
 */
export function withoutBlocker(
  projects: readonly Project[],
  removed: ProjectId,
): readonly Project[] {
  return projects.flatMap((project) =>
    project.blockedBy.includes(removed)
      ? [{ ...project, blockedBy: project.blockedBy.filter((id) => id !== removed) }]
      : [],
  )
}
