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
 * **It starts full, takes damage and heals**, which is the third shape
 * this has had and the first that behaves the way it was described.
 *
 * It was a flat average over the window: every target-day counted the
 * same, so one perfect day could contribute at most a seventh of the bar
 * and **hitting everything today could never get you near full.**
 * Reported as _"I hit both my goals for the day but am not at full
 * health"_, and reproduced exactly — two restoratives set up four days
 * earlier, both hit today, reading **20%** with the label honestly saying
 * "2 of 10 target days standing".
 *
 * That contradicted what the bar had already been asked for: _"I should
 * at least be able to go through today at 100, and if I don't hit my
 * goals by end of day, then it starts draining the next day."_ A drain is
 * not an average. So the window is walked oldest to newest from full: a
 * day carrying misses or overruns takes a bite, a day you hit everything
 * heals one back, and the result is clamped at both ends.
 *
 * **Still derived rather than stored, which is what the walk preserves.**
 * A bar that decayed on a timer would need somewhere to keep how full it
 * was, and device state with no correct merge is the trap `readCharges`
 * was written to avoid. Walking the window from a known full start is a
 * pure function of the spend log: two devices that have seen the same
 * spends agree, and it still drains by itself if you stop, because
 * missed days age *into* the window and take their bite as they arrive.
 *
 * **The numbers here are the app's own, and that is worth saying out
 * loud** because this model refuses invented scales nearly everywhere.
 * A ladder must name a published standard; this names none, and it is
 * allowed for the same reason the avatar's build bands are — it
 * *measures nothing about the world*. It re-reads pools you set
 * yourself, against targets you chose, over a window. Two constants and
 * three numbers: seven days, a quarter of the bar for a day fully
 * missed, and half of it back for a day fully hit. Recovery is faster
 * than decay on purpose — the break-even is hitting about a third of
 * your restoratives, so drifting downwards takes real neglect.
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

/**
 * What a day does to the bar, as a share of the whole.
 *
 * A day where every restorative was missed costs a quarter, so four
 * neglected days empty it. A day where every one was hit returns half, so
 * one good day after a bad week is visibly a recovery rather than a
 * rounding error — which is the complaint that produced this shape.
 *
 * **They are deliberately not equal.** Recovery outrunning decay is what
 * makes the bar worth looking at: a number that punishes harder than it
 * rewards is one you learn to ignore.
 */
export const DAMAGE_PER_DAY = 0.25
export const HEAL_PER_DAY = 0.5

export interface VitalityReading {
  /** 0–1, or absent when nothing could be judged. */
  readonly value?: number
  /** Target-days actually hit. */
  readonly met: number
  /** Days a limit was over. Each one cancels a hit. */
  readonly over: number
  /** Target-days there were to hit, across the window. */
  readonly possible: number
  readonly days: number
  /** Restoratives hit today, and how many there were. What the label says. */
  readonly todayMet: number
  readonly todayTargets: number
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
  let todayMet = 0
  let todayTargets = 0

  /*
   * Full until something takes it down. Walked oldest first, because a
   * day's damage has to land before the next day can heal it back — the
   * order is the whole difference between a drain and an average.
   */
  let health = 1

  for (const day of [...window].reverse()) {
    /*
     * **A day with nothing to measure is skipped whole.** Targets only
     * counted days since they were created — correctly — while limits
     * were judged across the entire window, so a caffeine pool that
     * predated the restoratives could spend seven days of overruns
     * against a single day of hitting everything. A day before you were
     * keeping any restorative is not a day you failed, and it cannot
     * drain a bar that was not being kept.
     */
    const live = targets.filter((pool) => existedOn(pool, day))
    if (live.length === 0) continue

    const hit = live.filter((pool) => metOn(pool, day)).length
    const missed = live.filter((pool) => missedOn(pool, day, today)).length
    const overToday = limits.filter((pool) => existedOn(pool, day) && overOn(pool, day)).length

    possible += live.length
    met += live.length - missed
    over += overToday

    if (day === today) {
      todayMet = hit
      todayTargets = live.length
    }

    /*
     * **Damage is capped at a full day's worth**, which the flat average
     * never was: `over` was added per limit per day with no ceiling, so
     * one limit run over every day could empty the bar however well the
     * restoratives went. A day can only ever be one bad day.
     */
    const harm = Math.min(1, (missed + overToday) / live.length)

    /*
     * **Heal first, then take the damage, and the order is the rule.**
     * Doing it in one expression let the heal swamp the harm: a day where
     * every restorative was hit *and* a limit was blown came out at a
     * full bar, because +0.5 against -0.08 clamps to one. The limits
     * stopped mattering on exactly the days somebody was doing well.
     *
     * Clamping the heal before subtracting means a day carrying an
     * overrun can never end full, however good the rest of it was.
     */
    const healed = Math.min(1, health + (hit / live.length) * HEAL_PER_DAY)
    health = Math.max(0, healed - harm * DAMAGE_PER_DAY)
  }

  if (possible === 0) return { met, over, possible, days, todayMet, todayTargets }

  return { value: health, met, over, possible, days, todayMet, todayTargets }
}
