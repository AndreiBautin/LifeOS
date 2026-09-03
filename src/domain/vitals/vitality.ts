import { shiftDay } from '@/domain/dailies/daily'
import { toDayKey } from '@/domain/time/day'

import { amountSpentOn, cycleOf, directionOf, isActive, readCharges, type Vice } from './charges'

/**
 * The health bar: how the last week has actually gone.
 *
 * Asked for as _"can we add like a health bar next to the hp at the top?
 * Going over on limits drains the health bar faster, which drains
 * overtime by itself and gets replaced with obviously hitting those."_
 *
 * **It starts full and depletes**, asked for as _"it should really start
 * full, and deplete with the things replacing them."_ That is what the
 * arithmetic says read forwards: every target-day you were keeping is
 * worth a share of the bar, and what takes a share away is **missing one
 * or going over a limit**. With nothing missed and nothing over — a
 * fresh set of restoratives, or a good week — it is full.
 *
 * **A rolling window rather than a stored level, and that is what makes
 * it honest.** A bar that decays on a timer needs somewhere to keep how
 * full it was, which is device state with no correct merge — the trap
 * `readCharges` was written to avoid, arriving again. Reading the last
 * seven days instead means it drains *by itself* for free: a day you hit
 * nothing ages into the window and a day you did ages out, so stopping
 * makes it fall without anything having to tick.
 *
 * **The numbers here are the app's own, and that is worth saying out
 * loud** because this model refuses invented scales nearly everywhere.
 * A ladder must name a published standard; this names none, and it is
 * allowed for the same reason the avatar's build bands are — it
 * *measures nothing about the world*. It re-reads pools you set
 * yourself, against targets you chose, over a window. Two constants and
 * one sentence: seven days, and a day over a limit cancels a day of
 * hitting a target.
 *
 * **Absent when there is nothing to judge.** With no targets the value
 * could only ever be nought, and a health bar pinned at empty reads as
 * dying rather than as unmeasured — the absent-never-zero rule at its
 * sharpest.
 *
 * **Today does not drain it until the day is over.** Reported as _"health
 * seems to drain awfully quickly — hasn't been a day yet and already down
 * to 33."_ Exactly right, and the arithmetic was doing it on purpose:
 * today sat in the window like any other day, so at nine in the morning
 * three untouched targets read as three misses. On a first day, when the
 * pools were created today and today is therefore the *only* day in the
 * window, one target hit out of three is 33% — a bar that opens
 * two-thirds empty because the day has not happened yet.
 *
 * This is the same humane rule streaks already follow, and it is worth
 * naming as such: a run is not broken by a day you have yet to live. An
 * unmet target today is **not yet missed** rather than missed, so the bar
 * starts the day full and falls tomorrow for whatever today did not do.
 *
 * **An overrun is judged today, and the asymmetry is the point.** Missing
 * a target is a thing that has not happened yet and may still; going over
 * a limit is a thing that has already happened and cannot be taken back.
 * Treating the two the same in either direction would be wrong — a bar
 * that ignored today's overruns would let a heavy night read as a perfect
 * day right up until midnight.
 */

/** How far back it looks. */
export const VITALITY_DAYS = 7

export interface VitalityReading {
  /** 0–1, or absent when nothing could be judged. */
  readonly value?: number
  /** Target-days actually hit. */
  readonly met: number
  /** Days a limit was over. Each one cancels a hit. */
  readonly over: number
  /** Target-days there were to hit — the denominator. */
  readonly possible: number
  readonly days: number
}

/**
 * A calendar-day pool: the only kind a day-by-day reading can judge.
 *
 * **A weekly target is left out of the denominator entirely** rather
 * than counted as missed — three of seven days is not a third of a
 * weekly goal in any sense this bar could use, and being unmeasurable is
 * not being failed.
 */
function isDaily(pool: Vice): boolean {
  const cycle = cycleOf(pool)
  return cycle.kind === 'calendar' && cycle.period === 'day'
}

/** Whether the pool had been created by the end of a given day. */
function existedOn(pool: Vice, day: string): boolean {
  return toDayKey(new Date(pool.createdAt)) <= day
}

/** Whether a target was reached on a given day. */
function metOn(pool: Vice, day: string): boolean {
  return amountSpentOn(pool, day) >= pool.capacity
}

/**
 * Whether a target counts against you on a given day *yet*.
 *
 * Met, or still today. See the note above: an unmet target on a day that
 * has not finished is not a miss, and counting it as one drains the bar
 * for a day nobody has had the chance to live.
 */
function missedOn(pool: Vice, day: string, today: string): boolean {
  return day !== today && !metOn(pool, day)
}

/**
 * Whether a limit stood exceeded at the end of a given day.
 *
 * Read through `readCharges` at that moment rather than by comparing the
 * day's own spend, so a **weekly** allowance is judged the way it is
 * actually stated: go past four drinks on Friday and you are over for
 * the rest of that week, and the bar says so on Saturday too. That is
 * the pool's own rule rather than a second opinion about it.
 */
function overOn(pool: Vice, day: string): boolean {
  /* Just before midnight, so the whole of that day counts. */
  const endOfDay = new Date(`${day}T23:59:59.999`)
  return readCharges(pool, endOfDay).over > 0
}

export function vitality(
  pools: readonly Vice[],
  now: Date,
  days: number = VITALITY_DAYS,
): VitalityReading {
  const live = pools.filter(isActive)
  const targets = live.filter((pool) => directionOf(pool) === 'target' && isDaily(pool))
  const limits = live.filter((pool) => directionOf(pool) === 'limit')

  const today = toDayKey(now)
  const window = Array.from({ length: days }, (_, back) => shiftDay(today, -back))

  let met = 0
  let over = 0
  let possible = 0

  for (const day of window) {
    /*
     * **A day with nothing to measure is skipped whole, and that is the
     * bug this shape exists to fix.** Targets only counted days since
     * they were created — correctly — while limits were judged across
     * the entire window, so a caffeine pool that predated the
     * restoratives could spend seven days' worth of overruns against a
     * single day of hitting everything.
     *
     * Reported as _"hit my water and veggie/fruit goals and my health
     * bar is empty still."_ Reproduced exactly: met 3, over 7, possible
     * 3 — an empty bar on a perfect day.
     *
     * A day before you were keeping any restorative is not a day you
     * failed, and it cannot drain a bar that was not being kept. So the
     * two halves share one window now: the day counts, or it does not.
     */
    const live = targets.filter((pool) => existedOn(pool, day))
    if (live.length === 0) continue

    possible += live.length
    /*
     * `met` is what the bar is full of, so today's outstanding targets
     * count here rather than being left out of the denominator. Dropping
     * them instead would make a fresh morning `possible: 0` — an absent
     * reading and the "set up your restoratives" empty state, shown to
     * somebody who just did.
     */
    for (const pool of live) if (!missedOn(pool, day, today)) met += 1
    for (const pool of limits) if (existedOn(pool, day) && overOn(pool, day)) over += 1
  }

  if (possible === 0) return { met, over, possible, days }

  /*
   * **Full, less what was missed and what went over.** Written as the
   * depletion it is rather than as a score climbing from nothing: the
   * two are the same number — `1 - (missed + over)/possible` is
   * `(met - over)/possible` — and only one of them reads the way the
   * bar behaves.
   *
   * Clamped at both ends. A terrible week cannot take it below empty:
   * there is no debt to carry, and a bar that had to be climbed out of
   * would punish one bad week into the next.
   */
  const missed = possible - met
  const value = Math.min(1, Math.max(0, 1 - (missed + over) / possible))

  return { value, met, over, possible, days }
}
