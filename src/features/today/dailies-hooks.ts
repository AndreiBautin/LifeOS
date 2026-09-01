import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { TRAINING, type HomeFilter, type RecordHome } from '@/domain/base/base'
import type { PartOfDay } from '@/domain/dailies/daily'
import { dailyActFor } from '@/domain/game/registry'
import {
  addDaily,
  type NewDaily,
  dailiesToday,
  keepToday,
  moveDailyHome,
  removeDaily,
  keepOn,
  recadenceDaily,
  relabelDaily,
  type Recadence,
  type Relabel,
  undoOn,
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
/*
 * Every list a daily can appear on. A mutation that misses one leaves a
 * screen showing a row that has moved — which is exactly what happened
 * when `['base']` was absent and adding a chore left Base saying "no
 * chores yet".
 */
const KEYS = [['today'], ['character'], ['base'], ['vitals'], ['training']] as const

/**
 * Habits for one home, or for all of them.
 *
 * Required rather than defaulted, which is the rule every list that can
 * return both already follows: a default is an opinion the call site did
 * not state, and forgetting it fails silently in one direction only.
 * `'both'` exists for the group picker, which offers names from every
 * home so one category does not get typed twice with different casing.
 */
export function useDailies(home: HomeFilter) {
  const services = useServices()

  return useQuery({
    queryKey: ['today', 'dailies', home],
    queryFn: () => dailiesToday(services, home),
  })
}

/**
 * Everything recurring that is outstanding today, wherever it is filed.
 *
 * Today's job is to say what is due — "Today is present tense" — and
 * once chores moved to Base and upkeep to Vitals, it stopped being able
 * to. The Dailies section quietly came to mean "recurring things that
 * are not house chores and are not body upkeep", which is a residue
 * rather than a category.
 *
 * **Due or done, and nothing else.** A chore not expected today belongs
 * on Base and would only be noise here; a chore already ticked stays so
 * the tick can be seen and undone. Own dailies are excluded because they
 * are listed in full just above — Today is their only home, so it is
 * also where they are managed.
 */
export function useDueElsewhere() {
  const services = useServices()

  return useQuery({
    queryKey: ['today', 'due-elsewhere'],
    queryFn: async () => {
      const all = await dailiesToday(services, 'both')
      return all.filter(
        (view) => view.daily.belongsTo !== undefined && (view.dueToday || view.doneToday),
      )
    },
  })
}

/** Habits tied to lifting, for the Train screen. */
export function useTrainingHabits() {
  const services = useServices()

  return useQuery({
    queryKey: ['training', 'habits'],
    queryFn: () => dailiesToday(services, TRAINING),
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
/**
 * The part is optional because most habits name none.
 *
 * A row on a banded list knows which part it is drawing and says so, so
 * a habit set to morning and evening can be ticked in one band without
 * the other going green. A row with no part passes none and the domain
 * behaves exactly as it did.
 */
export interface KeptToday {
  readonly id: DailyId
  readonly part?: PartOfDay
}

export function useKeepToday(home?: RecordHome) {
  return useDailyMutation<KeptToday>(
    'dailies.kept',
    ({ id, part }, services) => keepToday(id, services, part),
    dailyActFor(home),
  )
}

export function useUndoToday() {
  return useDailyMutation<KeptToday>('dailies.undone', ({ id, part }, services) =>
    undoToday(id, services, part),
  )
}

/**
 * Renaming, which pays nothing.
 *
 * Correcting a label is not an act — the same reason undo pays nothing
 * and the reason `retireDaily` does not either. XP is for things done.
 */
export function useRelabelDaily() {
  return useDailyMutation<{ id: DailyId } & Relabel>(
    'dailies.renamed',
    ({ id, ...change }, services) => relabelDaily(id, change, services),
  )
}

export function useRetireDaily() {
  return useDailyMutation<DailyId>('dailies.retired', (id, services) => retireDaily(id, services))
}

export function useRemoveDaily() {
  return useDailyMutation<DailyId>('dailies.removed', (id, services) => removeDaily(id, services))
}

/**
 * Ticking a day that is not today.
 *
 * Pays XP like any other completion, and `tallyActs` dates it by the day
 * it is filed under — so a day ticked late lands in the season it
 * belonged to rather than this one.
 */
export function useKeepOn(home?: RecordHome) {
  return useDailyMutation<{ id: DailyId; day: string }>(
    'dailies.kept-late',
    ({ id, day }, services) => keepOn(id, day, services),
    dailyActFor(home),
  )
}

export function useUndoOn() {
  return useDailyMutation<{ id: DailyId; day: string }>(
    'dailies.undone-late',
    ({ id, day }, services) => undoOn(id, day, services),
  )
}

/**
 * Changing which days a habit is expected on.
 *
 * Pays nothing — correcting a cadence is not a thing done, the same
 * reason a rename pays nothing.
 */
export function useRecadenceDaily() {
  return useDailyMutation<{ id: DailyId } & Recadence>(
    'dailies.recadenced',
    ({ id, ...change }, services) => recadenceDaily(id, change, services),
  )
}
