import { normaliseGroup } from '@/domain/dailies/groups'
import { keepFor, type HomeFilter, type RecordHome } from '@/domain/base/base'
import {
  complete,
  completePart,
  isDoneOn,
  isDueToday,
  PARTS_OF_DAY,
  type PartOfDay,
  isExpectedOn,
  partsOf,
  streakFor,
  timesDoneOn,
  timesPerDay,
  uncomplete,
  uncompletePart,
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
  /**
   * Which parts of the day it belongs to. Absent or empty means no
   * particular one, and naming more than one is what says it happens
   * more than once — see `partsOfDay` on `Daily`.
   */
  readonly partsOfDay?: readonly PartOfDay[]
  /** What kind of thing it is. Absent means it belongs to no group. */
  readonly group?: string
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

  // Held rather than called twice in the spread: the second call is a
  // fresh `string | undefined` the compiler cannot narrow.
  const group = normaliseGroup(input.group)
  const parts = PARTS_OF_DAY.filter((part) => input.partsOfDay?.includes(part) === true)

  await deps.dailies.save({
    id: deps.ids.next() as DailyId,
    title: trimmed,
    cadence: input.cadence,
    done: [],
    createdAt: deps.clock.now().toISOString(),
    /*
     * The count is dropped when parts are named, because they *are* the
     * count. Storing both would put two answers to "how many times a
     * day" on one record, and the one that lost would sit there looking
     * authoritative — the trap this codebase records over the fatigue
     * allowance, where two fields would have left no sentence to say.
     */
    ...(parts.length > 0 || input.timesPerDay === undefined || input.timesPerDay <= 1
      ? {}
      : { timesPerDay: Math.round(input.timesPerDay) }),
    ...(parts.length === 0 ? {} : { partsOfDay: parts }),
    ...(group === undefined ? {} : { group }),
    ...(input.belongsTo === undefined ? {} : { belongsTo: input.belongsTo }),
  })

  return {}
}

/**
 * Ticks today, or unticks it. Two names, because they are two things.
 *
 * **The part is named where the screen knows it**, which is every row on
 * a banded list: a habit set to morning and evening draws two rows, and
 * a tick that did not say which one would leave the two indistinguishable
 * in the record and make the second row impossible to draw. Callers with
 * no part — the history strip — leave it out and `complete` fills the
 * earliest one outstanding.
 */
export async function keepToday(id: DailyId, deps: DailyDeps, part?: PartOfDay): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const now = deps.clock.now()
  const today = toDayKey(now)
  const next = part === undefined ? complete(daily, today, now) : completePart(daily, today, part)
  // Identity means it was already ticked — no write, no sync traffic, and
  // no `updatedAt` churn that would make this device look newer than one
  // that actually changed something.
  if (next === daily) return

  await deps.dailies.save(next)
}

export async function undoToday(id: DailyId, deps: DailyDeps, part?: PartOfDay): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const today = toDayKey(deps.clock.now())
  const next = part === undefined ? uncomplete(daily, today) : uncompletePart(daily, today, part)
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

/**
 * Renames a habit, and changes nothing else about it.
 *
 * A title was fixed at creation, so a habit named wrongly — or named
 * before it meant what it means now — could only be retired and typed
 * again, which throws away the streak. That is the same bargain a pool
 * was offering before its name became editable, and it is worse here:
 * a pool's value is a list of spends and a habit's value *is* the run
 * of days.
 *
 * **Labels only — the title and the group.** The cadence and the times
 * a day are deliberately not here, and the difference is not
 * squeamishness about a bigger form. Both of these are *labels*: the
 * record means exactly what it meant before and every day it was kept
 * is still a day it was kept. A cadence decides *which days were
 * expected*, so changing it re-reads every streak the habit has ever
 * had — a habit kept every weekday for a year becomes a broken run the
 * moment it is told it was an every-day habit all along. That is a real
 * operation somebody may want, and it needs to say out loud what it
 * does to the history rather than arriving as a second field on a
 * rename box.
 *
 * The group joins the title because it is on the same side of that
 * line, and because a category is the field most likely to be wrong at
 * creation: you find out that everything falls into groups only after
 * you have a list long enough to look at.
 *
 * An empty name is refused rather than accepted and shown as a blank
 * row, matching `addDaily`. An empty *group* is accepted and means
 * ungrouped, which is how a habit leaves a group it no longer suits.
 *
 * **The home is here too, and it is the one thing in this call that is
 * not a label.** Reported: *"with uncategorised dailies I still can't
 * move them into the home section with all the other house tasks."*
 * True — the screen drew a **House** heading and the control that picks
 * a heading could not choose it, because House is a home and this field
 * only ever set a group. The only route was an unlabelled icon on the
 * row whose accessible name said *Base*, which is the area's name and
 * not the word on the heading.
 *
 * Since the screen shows homes and groups as **one** axis, the control
 * that picks a section has to offer both, and this is the call that
 * writes it. What it does differently is stated on the screen: a group
 * is a label and a home decides which area pays the XP, so filing a
 * habit to House means its ticks pay `base.chore-kept` from then on.
 *
 * **One save, not two.** A title, a group and a home are three fields of
 * one record, and two read-modify-writes fired together lose one of
 * them — the bug `reshapeStage` exists for, where a rename and a
 * retarget sent separately had the second read the copy from before the
 * first had saved. One form press is one edit.
 */
export interface Relabel {
  readonly title: string
  readonly group: string | undefined
  /**
   * Where it is filed. `undefined` means the record's own area.
   *
   * Always stated rather than optional, because "leave the home alone"
   * and "move it back to its own area" are the same value under an
   * optional field and opposite intentions. The form knows which it
   * means; a default here would be this function guessing.
   */
  readonly home: RecordHome | undefined
}

export async function relabelDaily(
  id: DailyId,
  change: Relabel,
  deps: DailyDeps,
): Promise<{ readonly error?: string }> {
  const trimmed = change.title.trim()
  if (trimmed === '') return { error: 'A daily needs a name.' }

  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return {}

  const named = normaliseGroup(change.group)

  // Dropped from the spread rather than set to undefined: under
  // `exactOptionalPropertyTypes` a key holding undefined is a key, and
  // it would travel over sync as one.
  const { group: _cleared, belongsTo: _refiled, ...rest } = daily

  await deps.dailies.save({
    ...rest,
    title: trimmed,
    ...(named === undefined ? {} : { group: named }),
    ...(change.home === undefined ? {} : { belongsTo: change.home }),
  })

  return {}
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
      /*
       * The **earliest** part it names, so a habit set to morning and
       * evening sorts with the morning. This orders whole records, and a
       * record that appears twice in the day has to be given one place
       * in a list that holds it once — the banded list expands it into
       * an occurrence per part and takes its order from the band.
       */
      const when = (view: DailyView) => {
        const parts = partsOf(view.daily)
        const first = parts[0]

        return first === undefined ? PARTS_OF_DAY.length : PARTS_OF_DAY.indexOf(first)
      }

      const byPart = when(a) - when(b)
      if (byPart !== 0) return byPart

      return a.daily.title.localeCompare(b.daily.title)
    })
}

/**
 * Ticks a day that is not today.
 *
 * **The gap this closes: a habit could only ever be ticked on the day
 * itself.** Forget the third feed at eleven at night and it was gone —
 * the row read 2 of 3 forever with nothing anywhere able to correct it.
 * That is also the only repair for an entry misfiled by the timezone bug
 * this app shipped five times, since nothing rewrites stored entries.
 *
 * **The future is refused.** Ticking tomorrow is not forgetfulness, it
 * is a claim about something that has not happened — and a streak built
 * on it would be the one number in this app that means nothing. The past
 * is allowed without limit: a day you did the thing is a day you did the
 * thing, whenever you get round to saying so.
 *
 * XP follows automatically and lands in the right place: `tallyActs`
 * counts completions by the day they are filed under, so a day ticked
 * late pays into the season it belonged to rather than this one.
 */
export async function keepOn(
  id: DailyId,
  day: string,
  deps: DailyDeps,
): Promise<{ readonly error?: string }> {
  const today = toDayKey(deps.clock.now())
  if (day > today) return { error: 'That day has not happened yet.' }

  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return {}

  /*
   * No `at`, so the entry is `<day>T00:00:00.000` rather than carrying
   * the time it was *recorded*. A backfilled tick knows which day it
   * belongs to and does not know what time of that day it happened, and
   * stamping "now" would file a Tuesday completion with Thursday's
   * clock — true of the typing, false of the doing.
   */
  const next = complete(daily, day)
  if (next === daily) return {}

  await deps.dailies.save(next)

  return {}
}

/** Takes back one completion on a given day. */
export async function undoOn(id: DailyId, day: string, deps: DailyDeps): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const next = uncomplete(daily, day)
  if (next === daily) return

  await deps.dailies.save(next)
}

/**
 * Changes which days a habit is expected on, and how many times.
 *
 * **This is the edit the rename form deliberately excluded**, and the
 * reason it was excluded has not gone away: a cadence decides *which
 * days were expected*, so changing it re-reads every streak the habit
 * has ever had. A habit kept every weekday for a year becomes a broken
 * run the moment it is told it was an every-day habit all along.
 *
 * It exists now because the alternative was worse. Without it a habit
 * set to the wrong cadence could only be retired and typed again, and
 * that throws away the run of days — which *is* a habit's value, more
 * so than a pool's list of spends.
 *
 * **Nothing is rewritten.** Every day it was kept stays kept; what
 * changes is which days it was expected on, and therefore what the
 * streak reads. The screen says so before the change rather than after.
 */
export interface Recadence {
  readonly cadence: Cadence
  readonly timesPerDay: number
  /**
   * Which parts of the day, and therefore how many times.
   *
   * **This is where the parts are edited, not the rename form**, and the
   * reason is the same one that put the cadence here: naming morning and
   * evening changes how many completions a day needs, so it re-reads
   * every streak the habit has ever had. A title and a group are labels
   * and change nothing; this is not a label.
   *
   * It was editable nowhere at all until now — settable on the add form
   * and then fixed forever, which is why a house chore filed months ago
   * read "Any time" with no way to say otherwise. The fifth instance of
   * a capability the model had and no screen could reach.
   */
  readonly partsOfDay: readonly PartOfDay[]
}

export async function recadenceDaily(
  id: DailyId,
  change: Recadence,
  deps: DailyDeps,
): Promise<void> {
  const daily = await deps.dailies.byId(id)
  if (daily === undefined) return

  const times = Math.max(1, Math.round(change.timesPerDay))
  const parts = PARTS_OF_DAY.filter((part) => change.partsOfDay.includes(part))

  /*
   * Three keys dropped from the spread rather than set to undefined: a
   * key holding undefined is a key, and it would travel over sync as
   * one. `partOfDay` goes with them because this is the write that
   * normalises the old single-part shape — leaving it behind would have
   * `partsOf` reading a stale answer the moment the list was cleared.
   */
  const { timesPerDay: _times, partsOfDay: _parts, partOfDay: _legacy, ...rest } = daily

  await deps.dailies.save({
    ...rest,
    cadence: change.cadence,
    // The parts are the count when there are any — see `addDaily`.
    ...(parts.length === 0 && times > 1 ? { timesPerDay: times } : {}),
    ...(parts.length === 0 ? {} : { partsOfDay: parts }),
  })
}
