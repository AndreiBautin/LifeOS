import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toDayKey } from '@/domain/time/day'

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
import {
  exportBacklog,
  importBacklog,
  type BacklogImportMode,
  type BacklogImportResult,
} from '@/application/use-cases/backlog/transfer'
import type { CreateItemInput, Item, ItemChanges } from '@/domain/backlog/item'
import {
  applyBacklogSettingsChanges,
  DEFAULT_BACKLOG_SETTINGS,
  type BacklogSettingsChanges,
} from '@/domain/backlog/settings'
import type { BacklogItemId } from '@/domain/ids/ids'
import { serialise } from '@/lib/serialise'
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

export function useBacklogSettings() {
  const services = useServices()
  const client = useQueryClient()

  const query = useQuery({
    queryKey: [...BACKLOG, 'settings'],
    queryFn: () => services.backlogSettings.get(),
  })

  const update = useMutation<unknown, Error, BacklogSettingsChanges>({
    mutationFn: async (changes) => {
      const current = await services.backlogSettings.get()
      await services.backlogSettings.save(applyBacklogSettingsChanges(current, changes))
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [...BACKLOG, 'settings'] })
    },
  })

  return { settings: query.data ?? DEFAULT_BACKLOG_SETTINGS, update }
}

/**
 * The way the old app's data gets here, and the way it leaves.
 *
 * The download is a Blob and an anchor click for the same reason the
 * training backup's is: it is the one mechanism that works in an
 * installed PWA on both iOS and Android.
 */
export function useBacklogTransfer() {
  const services = useServices()
  const client = useQueryClient()

  const exportItems = useMutation({
    mutationFn: async () => {
      const file = await exportBacklog(services)
      const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }))

      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `backlog-${toDayKey(services.clock.now())}.json`
      anchor.click()

      // Revoked on a later turn of the event loop: Safari is known to
      // cancel an in-flight download when the object URL goes away in
      // the same tick as the click.
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)
    },
    onSuccess: () => {
      logger.info('backlog.export', {})
    },
  })

  const importItems = useMutation<
    BacklogImportResult,
    Error,
    { raw: string; mode: BacklogImportMode }
  >({
    mutationFn: ({ raw, mode }) => importBacklog(raw, mode, services),
    onSuccess: (result) => {
      logger.info('backlog.import', {
        imported: result.imported,
        rejected: result.rejected,
        valid: result.envelopeValid,
      })
      void client.invalidateQueries({ queryKey: BACKLOG })
    },
  })

  return { exportItems, importItems }
}

export type { Item }
