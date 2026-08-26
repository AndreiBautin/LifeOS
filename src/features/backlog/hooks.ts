import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addBacklogItem,
  deleteBacklogItem,
  listBacklogItems,
  logBacklogProgress,
  updateBacklogItem,
  type ListBacklogOptions,
} from '@/application/use-cases/backlog/items'
import { backlogOverview, dailyGoalBoard } from '@/application/use-cases/backlog/overview'
import type { CreateItemInput, Item, ItemChanges } from '@/domain/backlog/item'
import type { BacklogItemId } from '@/domain/ids/ids'
import { logger } from '@/shared/logging/logger'

/**
 * The backlog's queries and mutations.
 *
 * Everything invalidates the whole `['backlog']` key rather than a
 * narrower one. The overview, the goal board and the list are three views
 * of the same array of items, so a change to any item can move all three —
 * and a narrower invalidation here would mean a stat that is correct on
 * one screen and stale on the next.
 */

const BACKLOG = ['backlog'] as const

export function useBacklogItems(options: ListBacklogOptions) {
  const services = useServices()

  return useQuery({
    queryKey: [...BACKLOG, 'items', options],
    queryFn: () => listBacklogItems(options, services),
  })
}

export function useBacklogOverview() {
  const services = useServices()

  return useQuery({
    queryKey: [...BACKLOG, 'overview'],
    queryFn: () => backlogOverview(services),
  })
}

export function useDailyGoals() {
  const services = useServices()

  return useQuery({
    queryKey: [...BACKLOG, 'goals'],
    queryFn: () => dailyGoalBoard(services),
  })
}

function useBacklogMutation<TVariables>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<unknown>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<unknown, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: BACKLOG })
    },
  })
}

/**
 * Runs work for one key strictly after the last work for that key.
 *
 * Logging progress is a read-modify-write against the stored item, so two
 * of them in flight at once both read the same starting amount and the
 * second overwrites the first — two taps counted as one. Disabling the
 * button while a mutation runs avoids the miscount by dropping the tap
 * instead, which from the reader's side is the same thing.
 *
 * Written here rather than reached for in the query library. React
 * Query's `scope` does exactly this and was tried first: it queues
 * correctly and then does not drain when an observer unmounts mid-queue —
 * which a hot reload or a re-render does — and the row goes permanently
 * dead with no error anywhere. A four-line promise chain has no such
 * failure mode.
 *
 * Keyed by item, so rows for different items still run in parallel.
 */
const chains = new Map<string, Promise<unknown>>()

function serialise<T>(key: string, work: () => Promise<T>): Promise<T> {
  // `catch` before chaining, so one failure does not poison the key
  // forever — the next tap gets a fresh attempt rather than the last
  // rejection.
  const next = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(work)
  chains.set(key, next)
  return next
}

export function useAddItem() {
  return useBacklogMutation<CreateItemInput>('backlog.add', (input, services) =>
    addBacklogItem(input, services),
  )
}

export function useUpdateItem() {
  return useBacklogMutation<{ id: BacklogItemId; changes: ItemChanges }>(
    'backlog.update',
    ({ id, changes }, services) => updateBacklogItem(id, changes, services),
  )
}

export function useDeleteItem() {
  return useBacklogMutation<BacklogItemId>('backlog.delete', (id, services) =>
    deleteBacklogItem(id, services),
  )
}

/**
 * One unit of progress against today, or one taken back.
 *
 * The undo is the same call with a negative delta, deliberately: an
 * accidental tap in a list of rows you press without looking should cost
 * one more tap to reverse, not a dialogue.
 *
 * Serialised per item — see {@link serialise}. Both taps land, and the
 * button stays live rather than going grey between them.
 */
export function useLogProgress() {
  return useBacklogMutation<{ id: BacklogItemId; delta: number }>(
    'backlog.progress',
    ({ id, delta }, services) => serialise(id, () => logBacklogProgress(id, { delta }, services)),
  )
}

export type { Item }
