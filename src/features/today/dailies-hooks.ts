import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { UPKEEP, type RecordHome } from '@/domain/base/base'
import {
  addDaily,
  type NewDaily,
  dailiesToday,
  keepToday,
  moveDailyHome,
  removeDaily,
  retireDaily,
  undoToday,
} from '@/application/use-cases/dailies/dailies'
import type { DailyId } from '@/domain/ids/ids'
import { useXpAward } from '@/app/xp-award'
import { logger } from '@/shared/logging/logger'

/**
 * Habits, from the UI's side.
 *
 * Everything invalidates `['today']`, `['character']` and `['base']`: a
 * tick changes the agenda, the streak and the XP on the character sheet,
 * and a narrower key would leave one of the three showing yesterday's
 * answer.
 *
 * `['base']` and `['vitals']` are here because **a daily lives in one of
 * three places and these hooks serve all of them.** Without it, adding a chore wrote the record
 * and left the Base screen saying "No chores yet" — the row was in the
 * database and the list that should have shown it was never told. A
 * mutation has to invalidate every list its record could appear on, not
 * only the one the hook was first written for.
 */
const KEYS = [['today'], ['character'], ['base'], ['vitals']] as const

export function useDailies() {
  const services = useServices()

  return useQuery({
    queryKey: ['today', 'dailies'],
    queryFn: () => dailiesToday(services, 'own-area'),
  })
}

/** Upkeep, for the Vitals screen — the body's own chores. */
export function useUpkeep() {
  const services = useServices()

  return useQuery({ queryKey: ['vitals', 'upkeep'], queryFn: () => dailiesToday(services, UPKEEP) })
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

/**
 * Adding a daily, into whichever area is doing the asking.
 *
 * The screen names the home rather than the hook guessing it, the same
 * way it names the act for `useKeepToday` — Today creates dailies and
 * Base creates chores, and each of them knows which it is.
 */
export function useAddDaily(home?: RecordHome) {
  return useDailyMutation<Omit<NewDaily, 'belongsTo'>>('dailies.added', (input, services) =>
    addDaily({ ...input, ...(home === undefined ? {} : { belongsTo: home }) }, services),
  )
}

/**
 * Moving a daily between Today and Base.
 *
 * Written when Base was and never called until now, which is why a daily
 * added on Today by somebody who meant it as a chore was stuck there
 * permanently. A move, not a re-create: the days it has already been
 * kept on are the whole value of the record.
 */
export function useMoveDailyHome() {
  return useDailyMutation<{ id: DailyId; home: RecordHome | undefined }>(
    'dailies.moved-home',
    ({ id, home }, services) => moveDailyHome(id, home, services),
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
