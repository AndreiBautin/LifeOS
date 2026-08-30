import { keepFor, type HomeFilter, type RecordHome } from '@/domain/base/base'
import {
  complete,
  isDoneOn,
  isDueToday,
  PARTS_OF_DAY,
  type PartOfDay,
  isExpectedOn,
  streakFor,
  timesDoneOn,
  timesPerDay,
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
  /** How many of today's completions are in, and how many it asked for. */
  readonly doneCount: number
  readonly needed: number
  /** Expected today at all — a weekday habit is not "missed" on Sunday. */
  readonly expectedToday: boolean
}

/**
 * Creates a daily, in the area that asked for it.
 *
 * `home` exists because Base could not make a chore at all. The screen
 * said "add one from Today", Today created a daily in its own area, and
 * the only thing that could have moved it — `moveDailyHome` — had no
 * caller anywhere in the app. So the instruction was impossible to
 * follow, which is worse than a missing button: a missing button is
 * visible.
 *
 * Absent means the record's own area, as everywhere else `belongsTo` is
 * read.
 */
export interface NewDaily {
  readonly title: string
  readonly cadence: Cadence
  /** Absent means once, which is what every record before this meant. */
  readonly timesPerDay?: number
  /** Which part of the day it belongs to. Absent means no particular one. */
  readonly partOfDay?: PartOfDay
  /** Absent means the record's own area. */
  readonly belongsTo?: RecordHome
}

/**
 * Creates a daily, in the area that asked for it.
 *
 * **An object rather than a fourth and fifth positional parameter**, and
 * that is not tidiness. The optional fields were being passed from the
 * screen inside a spread — `...(howMany > 1 ? { timesPerDay } : {})` —
 * which defeats excess-property checking, so a value the form collected
 * was silently dropped and nothing failed to compile. A named input
 * makes the compiler the thing that notices, which is what it is for.
 */
export async function addDaily(
  input: NewDaily,
  deps: DailyDeps,
): Promise<{ readonly error?: string }> {
  const trimmed = input.title.trim()
  if (trimmed === '') return { error: 'A daily needs a name.' }

  await deps.dailies.save({
    id: deps.ids.next() as DailyId,
    title: trimmed,
    cadence: input.cadence,
    done: [],
    createdAt: deps.clock.now().toISOString(),
    ...(input.timesPerDay === undefined || input.timesPerDay <= 1
      ? {}
      : { timesPerDay: Math.round(input.timesPerDay) }),
    ...(input.partOfDay === undefined ? {} : { partOfDay: input.partOfDay }),
    ...(input.belongsTo === undefined ? {} : { belongsTo: input.belongsTo }),
  })

  return {}
}

/** Ticks today, or unticks it. Two names, because they are two things. */
export async function keepToday(id: DailyId, deps: DailyDeps): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const now = deps.clock.now()
  const today = toDayKey(now)
  const next = complete(daily, today, now)
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
      // Through `isDoneOn`, not a second copy of it. This read
      // `done.includes(today)` — the same answer while every habit was
      // once a day, and wrong the moment one asked for three.
      doneToday: isDoneOn(daily, today),
      doneCount: timesDoneOn(daily, today),
      needed: timesPerDay(daily),
      expectedToday: isExpectedOn(daily, today),
    }))
    .sort((a, b) => {
      // Due first, then done, then not expected today at all.
      const rank = (view: DailyView) => (view.dueToday ? 0 : view.doneToday ? 1 : 2)
      const byRank = rank(a) - rank(b)
      if (byRank !== 0) return byRank

      /*
       * Then in the order the day happens, so a list of habits reads as
       * a routine: the house is opened before it is closed.
       *
       * **Chronological, not "whatever part it is now first."** Putting
       * the current part at the top is the more obviously clever rule
       * and is worse to live with: the list would reorder itself twice a
       * day, so the thing you reach for by position moves, and a glance
       * at breakfast and a glance at bedtime disagree about where
       * anything is. Anything with no part sorts last, because it
       * belongs to no point in the day rather than to the start of it.
       */
      const when = (view: DailyView) =>
        view.daily.partOfDay === undefined
          ? PARTS_OF_DAY.length
          : PARTS_OF_DAY.indexOf(view.daily.partOfDay)

      const byPart = when(a) - when(b)
      if (byPart !== 0) return byPart

      return a.daily.title.localeCompare(b.daily.title)
    })
}
