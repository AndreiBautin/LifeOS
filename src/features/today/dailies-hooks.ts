import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addDaily,
  dailiesToday,
  keepToday,
  removeDaily,
  retireDaily,
  undoToday,
} from '@/application/use-cases/dailies/dailies'
import type { Cadence } from '@/domain/dailies/daily'
import type { DailyId } from '@/domain/ids/ids'
import { logger } from '@/shared/logging/logger'

/**
 * Habits, from the UI's side.
 *
 * Everything invalidates `['today']` and `['character']`: a tick changes
 * the agenda, the streak and the XP on the character sheet, and a narrower
 * key would leave one of the three showing yesterday's answer.
 */
const KEYS = [['today'], ['character']] as const

export function useDailies() {
  const services = useServices()

  return useQuery({
    queryKey: ['today', 'dailies'],
    queryFn: () => dailiesToday(services, 'own-area'),
  })
}

/** Chores, for the Base screen. */
export function useChores() {
  const services = useServices()

  return useQuery({ queryKey: ['base', 'chores'], queryFn: () => dailiesToday(services, 'base') })
}

function useDailyMutation<TVariables>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<unknown>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<unknown, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      for (const key of KEYS) void client.invalidateQueries({ queryKey: key })
    },
  })
}

export function useAddDaily() {
  return useDailyMutation<{ title: string; cadence: Cadence }>(
    'dailies.added',
    ({ title, cadence }, services) => addDaily(title, cadence, services),
  )
}

export function useKeepToday() {
  return useDailyMutation<DailyId>('dailies.kept', (id, services) => keepToday(id, services))
}

export function useUndoToday() {
  return useDailyMutation<DailyId>('dailies.undone', (id, services) => undoToday(id, services))
}

export function useRetireDaily() {
  return useDailyMutation<DailyId>('dailies.retired', (id, services) => retireDaily(id, services))
}

export function useRemoveDaily() {
  return useDailyMutation<DailyId>('dailies.removed', (id, services) => removeDaily(id, services))
}
