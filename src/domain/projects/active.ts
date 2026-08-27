import type { ProjectId } from '@/domain/ids/ids'

import { indexProjects, type Project, type QuestKind } from './project'

/**
 * Removes the stamp, rather than setting it to `undefined`.
 *
 * `exactOptionalPropertyTypes` draws the distinction and IndexedDB keeps
 * it: a key holding `undefined` is a key, and it would travel over sync as
 * one. Standing a quest down should leave no trace that it was ever the
 * active one, not a null where the stamp was.
 */
function withoutStamp(project: Project): Project {
  const { activatedAt: _cleared, ...rest } = project
  return rest
}

/**
 * Which quest you are on, per kind.
 *
 * Derived from `activatedAt` rather than read off a flag, so that a merge
 * which leaves two quests stamped resolves to one answer instead of two.
 * The most recently activated wins, which is also what a person means by
 * "the one I picked".
 *
 * A completed quest is never active. Finishing the thing you were on
 * should not leave it sitting at the top of the screen as your current
 * business, and requiring a separate stand-down for that would be a
 * second action for one event.
 */
export function activeQuest(projects: readonly Project[], kind: QuestKind): Project | undefined {
  return projects
    .filter(
      (project) =>
        kindOf(project) === kind &&
        project.status !== 'completed' &&
        project.activatedAt !== undefined,
    )
    .sort((a, b) => (b.activatedAt ?? '').localeCompare(a.activatedAt ?? ''))[0]
}

/** Absent means side — see the note on `Project.kind`. */
export function kindOf(project: Project): QuestKind {
  return project.kind ?? 'side'
}

/**
 * Makes one quest the active one of its kind, standing the previous one
 * down.
 *
 * Returns every record that changed, so the caller writes them in one go.
 * Clearing the others is not what makes the answer correct — `activeQuest`
 * would resolve it anyway — it is what keeps the stored state tidy enough
 * that a person reading the database sees what they expect.
 */
export function activate(
  projects: readonly Project[],
  id: ProjectId,
  now: string,
): readonly Project[] {
  const target = indexProjects(projects).get(id)
  if (target === undefined) return []

  const kind = kindOf(target)
  const changed: Project[] = [{ ...target, activatedAt: now }]

  for (const project of projects) {
    if (project.id === id) continue
    if (kindOf(project) !== kind) continue
    if (project.activatedAt === undefined) continue

    changed.push(withoutStamp(project))
  }

  return changed
}

/** Clears the active quest of a kind, leaving none. */
export function standDown(projects: readonly Project[], kind: QuestKind): readonly Project[] {
  return projects
    .filter((project) => kindOf(project) === kind && project.activatedAt !== undefined)
    .map(withoutStamp)
}
