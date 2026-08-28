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
import { useXpAward } from '@/app/xp-award'
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
  /** The act this performs, when it performs one. Read from the registry. */
  actId?: string,
) {
  const services = useServices()
  const client = useQueryClient()
  const { award } = useXpAward()

  return useMutation<unknown, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      if (actId !== undefined) award(actId)
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

/**
 * Which act this is depends on where the habit lives, so the caller says.
 *
 * A chore pays `base.chore-kept` and a daily pays `dailies.completed` —
 * the same fifteen points under different names, and `tallyActs` already
 * splits them by `belongsTo` for exactly this reason. The screen calling
 * this *is* the area, so it is the honest place for the answer; deriving
 * it here would mean fetching the record to find out what was just done
 * to it.
 *
 * **Undo pays nothing.** Not a negative award and not a silent one — it
 * takes the day back, and the sheet will show that at the next read. An
 * acknowledgement is for acts.
 */
export function useKeepToday(actId = 'dailies.completed') {
  return useDailyMutation<DailyId>('dailies.kept', (id, services) => keepToday(id, services), actId)
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
