import { keepFor, type HomeFilter, type RecordHome } from '@/domain/base/base'
import {
  complete,
  isDueToday,
  isExpectedOn,
  streakFor,
  uncomplete,
  type Cadence,
  type Daily,
} from '@/domain/dailies/daily'
import type { DailyId, IdGenerator } from '@/domain/ids/ids'
import type { Clock, DailyRepository } from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'

/**
 * Habits, from the application's side.
 *
 * Ticking is idempotent all the way down — the domain returns the same
 * object when a day is already done, and this skips the write when it
 * does. That matters more here than anywhere else in the hub: a habit is
 * the thing most likely to be tapped twice, on two devices, on the same
 * morning.
 */

export interface DailyDeps {
  readonly dailies: DailyRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface DailyView {
  readonly daily: Daily
  readonly streak: number
  readonly dueToday: boolean
  readonly doneToday: boolean
  /** Expected today at all — a weekday habit is not "missed" on Sunday. */
  readonly expectedToday: boolean
}

export async function addDaily(
  title: string,
  cadence: Cadence,
  deps: DailyDeps,
): Promise<{ readonly error?: string }> {
  const trimmed = title.trim()
  if (trimmed === '') return { error: 'A daily needs a name.' }

  await deps.dailies.save({
    id: deps.ids.next() as DailyId,
    title: trimmed,
    cadence,
    done: [],
    createdAt: deps.clock.now().toISOString(),
  })

  return {}
}

/** Ticks today, or unticks it. Two names, because they are two things. */
export async function keepToday(id: DailyId, deps: DailyDeps): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const today = toDayKey(deps.clock.now())
  const next = complete(daily, today)
  // Identity means it was already ticked — no write, no sync traffic, and
  // no `updatedAt` churn that would make this device look newer than one
  // that actually changed something.
  if (next === daily) return

  await deps.dailies.save(next)
}

export async function undoToday(id: DailyId, deps: DailyDeps): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const next = uncomplete(daily, toDayKey(deps.clock.now()))
  if (next === daily) return

  await deps.dailies.save(next)
}

/**
 * Retires a habit rather than deleting it.
 *
 * The days it was kept survive, which is the point: eighty days of a habit
 * you have finished with is a thing that happened, and deleting the record
 * is the only other way to stop being asked about it.
 */
export async function retireDaily(id: DailyId, deps: DailyDeps): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  await deps.dailies.save({ ...daily, retiredAt: toDayKey(deps.clock.now()) })
}

export async function removeDaily(id: DailyId, deps: DailyDeps): Promise<void> {
  await deps.dailies.remove(id)
}

/**
 * Today's habits, due ones first.
 *
 * Retired habits are left out entirely — they are expected on no day, so
 * every one of their numbers would read as a zero rather than as an
 * absence.
 */
/**
 * Moves a record between Base and its own area.
 *
 * A *move*, not a create-and-delete, and that is the whole reason this
 * exists rather than a checkbox on the add form. The common case is a
 * quest log that has quietly filled up with house work — the leaking tap
 * has been on the list for a month, with its steps and its history — and
 * retyping it into a new home would throw away the part that took effort
 * to record.
 *
 * One field changes. Nothing about the record's identity, steps or
 * completions moves with it, so XP already earned stays earned in
 * whichever area paid it: `tallyActs` reads the *current* home, and a
 * quest moved to Base today stops paying `projects.*` from today. That is
 * the honest reading of a reclassification — you have not un-done the
 * work, you have changed what it is filed under — and it is the same
 * trade `completedAsKind` makes for main and side quests, in the other
 * direction, for the same reason.
 */
export async function moveDailyHome(
  id: DailyId,
  home: RecordHome | undefined,
  deps: DailyDeps,
): Promise<void> {
  const existing = (await deps.dailies.all()).find((daily) => daily.id === id)
  if (existing === undefined) return

  const { belongsTo: _dropped, ...rest } = existing

  await deps.dailies.save(home === undefined ? rest : { ...rest, belongsTo: home })
}

export async function dailiesToday(
  deps: DailyDeps,
  home: HomeFilter,
): Promise<readonly DailyView[]> {
  const today = toDayKey(deps.clock.now())
  const dailies = keepFor(await deps.dailies.all(), home)

  return dailies
    .filter((daily) => daily.retiredAt === undefined)
    .map((daily) => ({
      daily,
      streak: streakFor(daily, today),
      dueToday: isDueToday(daily, today),
      doneToday: daily.done.includes(today),
      expectedToday: isExpectedOn(daily, today),
    }))
    .sort((a, b) => {
      // Due first, then done, then not expected today at all.
      const rank = (view: DailyView) => (view.dueToday ? 0 : view.doneToday ? 1 : 2)
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank
      return a.daily.title.localeCompare(b.daily.title)
    })
}
