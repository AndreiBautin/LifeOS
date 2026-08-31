import type { RecordHome } from '@/domain/base/base'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  activeQuests,
  addAction,
  addProject,
  deleteProject,
  listProjects,
  moveProjectHome,
  recommendation,
  setActionStatus,
  setActiveQuest,
  setBlockers,
  type NewProject,
  type ProjectChanges,
  updateProject,
} from '@/application/use-cases/projects/projects'
import type { ActionId, ProjectId } from '@/domain/ids/ids'
import type { QuestKind } from '@/domain/projects/project'
import { logger } from '@/shared/logging/logger'

/**
 * The quest log's queries and mutations.
 *
 * Everything invalidates the whole `['projects']` key. Almost every write
 * here can move records other than the one it names — completing a project
 * un-blocks the ones waiting on it — so a narrower invalidation would
 * leave the list showing a project as blocked by something already
 * finished.
 */

const PROJECTS = ['projects'] as const

export function useProjects() {
  const services = useServices()

  return useQuery({
    queryKey: [...PROJECTS, 'all'],
    queryFn: () => listProjects(services, 'own-area'),
  })
}

/** House jobs, for the Base screen. Keyed apart so the two do not share a cache. */
export function useBaseProjects() {
  const services = useServices()

  return useQuery({
    queryKey: [...PROJECTS, 'base'],
    queryFn: () => listProjects(services, 'base'),
  })
}

export function useRecommendation() {
  const services = useServices()

  return useQuery({
    queryKey: [...PROJECTS, 'recommendation'],
    queryFn: () => recommendation(services, 'own-area'),
  })
}

function useProjectMutation<TVariables, TResult>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<TResult>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<TResult, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: PROJECTS })
    },
  })
}

export function useAddProject() {
  return useProjectMutation<NewProject, unknown>('projects.add', (input, services) =>
    addProject(input, services),
  )
}

export function useUpdateProject() {
  return useProjectMutation<{ id: ProjectId; changes: ProjectChanges }, unknown>(
    'projects.update',
    ({ id, changes }, services) => updateProject(id, changes, services),
  )
}

/**
 * Moves a quest into Base, or back out.
 *
 * Invalidates the same keys every project mutation does, which matters
 * more here than elsewhere: the record leaves one list and joins another,
 * so a stale cache would show it in both at once — the exact duplicate the
 * split is meant to prevent.
 */
export function useMoveProjectHome() {
  return useProjectMutation<{ id: ProjectId; home: RecordHome | undefined }, unknown>(
    'projects.moved-home',
    ({ id, home }, services) => moveProjectHome(id, home, services),
  )
}

export function useDeleteProject() {
  return useProjectMutation<ProjectId, unknown>('projects.delete', (id, services) =>
    deleteProject(id, services),
  )
}

export function useAddAction() {
  return useProjectMutation<
    { id: ProjectId; description: string; availableFrom?: string },
    unknown
  >('projects.action-added', ({ id, description, availableFrom }, services) =>
    addAction(id, description, availableFrom, services),
  )
}

export function useSetActionStatus() {
  return useProjectMutation<{ id: ProjectId; actionId: ActionId; done: boolean }, unknown>(
    'projects.action-closed',
    ({ id, actionId, done }, services) => setActionStatus(id, actionId, done, services),
  )
}

/**
 * Setting blockers is the one mutation whose failure is expected.
 *
 * A cycle is refused with a message rather than thrown, so the result —
 * not the error — is what the screen reads.
 */
export function useSetBlockers() {
  return useProjectMutation<
    { id: ProjectId; blockerIds: readonly ProjectId[] },
    { readonly error?: string }
  >('projects.blockers', ({ id, blockerIds }, services) => setBlockers(id, blockerIds, services))
}

/**
 * The two quests you are on.
 *
 * Derived from `activatedAt` stamps rather than a stored pair of ids, so
 * a merge that left two quests stamped still resolves to one of each.
 */
export function useActiveQuests() {
  const services = useServices()

  return useQuery({ queryKey: [...PROJECTS, 'active'], queryFn: () => activeQuests(services) })
}

export function useSetActiveQuest() {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<undefined, Error, { id?: ProjectId; kind: QuestKind }>({
    mutationFn: ({ id, kind }) => setActiveQuest(id, kind, services).then(() => undefined),
    onSuccess: () => {
      logger.info('quests.active-changed', {})
      void client.invalidateQueries({ queryKey: PROJECTS })
      void client.invalidateQueries({ queryKey: ['today'] })
    },
  })
}
