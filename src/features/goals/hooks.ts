import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addGoal,
  addItemTo,
  answerQuestionIn,
  completeItemIn,
  confirmHypothesisIn,
  decideItemIn,
  goalStanding,
  goalStandings,
  linkableProjects,
  linkItemToProjectIn,
  refuteHypothesisIn,
  removeGoal,
  removeItemFrom,
  renameGoalIn,
  renameItemIn,
  renameWorkstreamIn,
  reopenItemIn,
  setDependenciesIn,
  unlinkItemFromProjectIn,
  type NewGoal,
  type NewGoalItem,
} from '@/application/use-cases/goals/goals'
import type { GoalId, GoalItemId, ProjectId } from '@/domain/ids/ids'

export const GOALS = ['goals'] as const

export function useGoals() {
  const services = useServices()
  return useQuery({ queryKey: GOALS, queryFn: () => goalStandings(services) })
}

export function useGoal(id: GoalId | undefined) {
  const services = useServices()
  return useQuery({
    queryKey: [...GOALS, id],
    queryFn: async () => {
      // `enabled` keeps TanStack Query from calling this with no id, but
      // it does not narrow the type, so the guard is real rather than
      // decorative.
      if (id === undefined) throw new Error('useGoal called with no id.')
      // TanStack Query refuses `undefined` as query data outright -- a
      // real goal that has since been removed (this page open, deleted
      // from another tab, or the "Sure?" delete confirm on this one)
      // must read as `null`, the same coercion `usePosition` makes.
      return (await goalStanding(id, services)) ?? null
    },
    enabled: id !== undefined,
  })
}

/**
 * Every goal mutation, on one path.
 *
 * **Nothing here awards XP**, the same absence `useCampaignMutation`
 * documents and for the same reason: a goal is a planning surface, not a
 * scored area, so there is no `xp-award` call to be missing.
 */
function useGoalMutation<T, R = unknown>(
  run: (input: T, services: ReturnType<typeof useServices>) => Promise<R>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<R, Error, T>({
    mutationFn: (input: T) => run(input, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: GOALS })
    },
  })
}

export function useAddGoal() {
  return useGoalMutation<NewGoal>((input, services) => addGoal(input, services))
}

export function useAddItem() {
  return useGoalMutation<{ id: GoalId; item: NewGoalItem }>(({ id, item }, services) =>
    addItemTo(id, item, services),
  )
}

/**
 * Setting dependencies is the one goal mutation whose failure is
 * expected — a cycle is something a person asked for on purpose, the
 * same reasoning `useSetBlockers` carries for a quest's blockers. The
 * message, not the error, is what the screen reads.
 */
export function useSetDependencies() {
  return useGoalMutation<
    { id: GoalId; itemId: GoalItemId; dependsOn: readonly GoalItemId[] },
    { readonly error?: string }
  >(({ id, itemId, dependsOn }, services) => setDependenciesIn(id, itemId, dependsOn, services))
}

export function useDecideItem() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId; decidedAs: string }>(
    ({ id, itemId, decidedAs }, services) => decideItemIn(id, itemId, decidedAs, services),
  )
}

export function useConfirmHypothesis() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId }>(({ id, itemId }, services) =>
    confirmHypothesisIn(id, itemId, services),
  )
}

export function useRefuteHypothesis() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId }>(({ id, itemId }, services) =>
    refuteHypothesisIn(id, itemId, services),
  )
}

export function useAnswerQuestion() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId; answeredAs: string }>(
    ({ id, itemId, answeredAs }, services) => answerQuestionIn(id, itemId, answeredAs, services),
  )
}

export function useCompleteItem() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId }>(({ id, itemId }, services) =>
    completeItemIn(id, itemId, services),
  )
}

export function useReopenItem() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId }>(({ id, itemId }, services) =>
    reopenItemIn(id, itemId, services),
  )
}

export function useRemoveItem() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId }>(({ id, itemId }, services) =>
    removeItemFrom(id, itemId, services),
  )
}

export function useRenameGoal() {
  return useGoalMutation<{ id: GoalId; name: string; aim: string }>(({ id, name, aim }, services) =>
    renameGoalIn(id, name, aim, services),
  )
}

export function useRemoveGoal() {
  return useGoalMutation<GoalId>((id, services) => removeGoal(id, services))
}

export function useRenameItem() {
  return useGoalMutation<{
    id: GoalId
    itemId: GoalItemId
    title: string
    workstream: string
    notes: string
  }>(({ id, itemId, title, workstream, notes }, services) =>
    renameItemIn(id, itemId, title, workstream, notes, services),
  )
}

export function useRenameWorkstream() {
  return useGoalMutation<{ id: GoalId; from: string; to: string }>(({ id, from, to }, services) =>
    renameWorkstreamIn(id, from, to, services),
  )
}

/** Every quest, for the link picker. Its own key: irrelevant to any goal's standing, so it never invalidates one. */
export function useLinkableProjects() {
  const services = useServices()
  return useQuery({
    queryKey: ['goals', 'linkable-projects'],
    queryFn: () => linkableProjects(services),
  })
}

export function useLinkItem() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId; projectId: ProjectId }>(
    ({ id, itemId, projectId }, services) => linkItemToProjectIn(id, itemId, projectId, services),
  )
}

export function useUnlinkItem() {
  return useGoalMutation<{ id: GoalId; itemId: GoalItemId }>(({ id, itemId }, services) =>
    unlinkItemFromProjectIn(id, itemId, services),
  )
}
