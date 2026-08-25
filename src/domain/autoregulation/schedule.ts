import type { WorkoutLog } from '@/domain/logging/workout-log'

/**
 * Autoregulating the schedule itself: how many days a week, and how many
 * weeks until a deload.
 *
 * Both are derived from what actually happened rather than chosen up
 * front, and both are **bounded, with the boundary treated as a signal
 * rather than a wall**. If the arithmetic wants to push frequency to
 * seven days or call for a deload after two weeks, the answer is not to
 * do that — it is that the volume allocation is wrong, and the lifter
 * should be told so.
 */

export const MIN_DAYS_PER_WEEK = 2
export const MAX_DAYS_PER_WEEK = 6

/**
 * Five days, Monday to Friday.
 *
 * Chosen from what the session lengths do at the extremes rather than
 * from preference. Four days carries the week's volume in four sittings
 * and, with arms specialised, runs the upper days past seventy-five
 * minutes while the lower days finish in thirty. Six divides the same
 * volume so finely that several sessions are barely worth the trip.
 *
 * Defined once because the settings default and the recipe default are
 * the same decision — when they were written separately they disagreed,
 * and a block built from settings quietly came out a different shape from
 * the built-in of the same name.
 */
export const DEFAULT_DAYS_PER_WEEK = 5

/** Sessions running past this are a sign there are too few of them. */
export const SESSION_TOO_LONG_MINUTES = 120

/**
 * Sessions this short mean the week could be consolidated.
 *
 * Forty, not sixty. Sixty was calibrated when four days was the default,
 * and it does not survive the move to five: the same weekly volume spread
 * over five sittings averages the middle fifties, so a sixty-minute floor
 * would have the app recommend consolidating back to four the moment the
 * default block was run — recommending against its own default.
 *
 * What the floor is for is catching sessions not worth the trip. A
 * twenty-five minute day is that; a tight fifty-five minute day is not.
 */
export const SESSION_TOO_SHORT_MINUTES = 40

/** How many recent sessions the average is taken over. */
export const DURATION_SAMPLE_SIZE = 6

export type ScheduleAdjustment = 'add-day' | 'remove-day' | 'hold'

export interface FrequencyProposal {
  readonly adjustment: ScheduleAdjustment
  readonly currentDays: number
  readonly proposedDays: number
  readonly averageMinutes: number
  readonly sampleSize: number
  /** True when the arithmetic wanted to move but the bounds refused. */
  readonly blocked: boolean
  readonly reason: string
}

/**
 * Whether the week should hold more or fewer sessions.
 *
 * The logic is simple because the signal is: total weekly work is set by
 * the volume targets, so if each session is running long there are too
 * few of them to hold that work, and if each is running short there are
 * too many. Rest is fixed at two minutes and tracked, which is what makes
 * duration a usable proxy for volume rather than for dawdling.
 */
export function proposeFrequency(
  recentSessions: readonly WorkoutLog[],
  currentDays: number,
): FrequencyProposal {
  const durations = recentSessions
    .filter((log) => log.status === 'completed' && log.completedAt !== undefined)
    .slice(0, DURATION_SAMPLE_SIZE)
    .map((log) => minutesBetween(log.startedAt, log.completedAt ?? log.startedAt))
    // A three-minute "session" is a mis-tap, not evidence.
    .filter((minutes) => minutes >= 10)

  if (durations.length < 3) {
    return {
      adjustment: 'hold',
      currentDays,
      proposedDays: currentDays,
      averageMinutes: 0,
      sampleSize: durations.length,
      blocked: false,
      reason: 'Not enough completed sessions yet to judge session length.',
    }
  }

  const average = Math.round(durations.reduce((sum, m) => sum + m, 0) / durations.length)

  const wanted: ScheduleAdjustment =
    average > SESSION_TOO_LONG_MINUTES
      ? 'add-day'
      : average < SESSION_TOO_SHORT_MINUTES
        ? 'remove-day'
        : 'hold'

  if (wanted === 'hold') {
    return {
      adjustment: 'hold',
      currentDays,
      proposedDays: currentDays,
      averageMinutes: average,
      sampleSize: durations.length,
      blocked: false,
      reason: `Sessions are averaging ${String(average)} minutes, which is where they should sit.`,
    }
  }

  const proposed = wanted === 'add-day' ? currentDays + 1 : currentDays - 1

  if (proposed > MAX_DAYS_PER_WEEK || proposed < MIN_DAYS_PER_WEEK) {
    // The bound is the diagnosis. Needing a seventh day means the weekly
    // volume is more than the week can hold, not that the week is short.
    return {
      adjustment: 'hold',
      currentDays,
      proposedDays: currentDays,
      averageMinutes: average,
      sampleSize: durations.length,
      blocked: true,
      reason:
        wanted === 'add-day'
          ? `Sessions average ${String(average)} minutes and you are already training ${String(currentDays)} days. Adding another would exceed ${String(MAX_DAYS_PER_WEEK)} — the problem is total volume, not how it is split. Cut sets from your lowest tier.`
          : `Sessions average ${String(average)} minutes and you are already at ${String(currentDays)} days. Dropping another would fall below ${String(MIN_DAYS_PER_WEEK)} — you are under-training rather than over-consolidated. Raise volume on your priorities.`,
    }
  }

  return {
    adjustment: wanted,
    currentDays,
    proposedDays: proposed,
    averageMinutes: average,
    sampleSize: durations.length,
    blocked: false,
    reason:
      wanted === 'add-day'
        ? `Sessions are averaging ${String(average)} minutes. Splitting the same work across ${String(proposed)} days keeps each one finishable.`
        : `Sessions are averaging ${String(average)} minutes. The same work fits in ${String(proposed)} days.`,
  }
}

/* -------------------------------------------------------------------- */
/* Deload timing                                                         */
/* -------------------------------------------------------------------- */

export const DEFAULT_WEEKS_BEFORE_DELOAD = 6
export const MIN_WEEKS_BEFORE_DELOAD = 4
export const MAX_WEEKS_BEFORE_DELOAD = 8

export interface DeloadProposal {
  readonly weeksCompleted: number
  readonly plannedWeeks: number
  readonly shouldDeloadNow: boolean
  readonly proposedWeeks: number
  readonly blocked: boolean
  readonly reason: string
}

export interface BlockPerformance {
  /** Working weeks finished in the current block. */
  readonly weeksCompleted: number
  readonly plannedWeeks: number
  /** Sessions where performance fell short of the previous week's. */
  readonly regressedSessions: number
  readonly totalSessions: number
  /** Muscles reporting persistent soreness or "too much" workload. */
  readonly musclesFlaggingOverreach: number
  /** Accumulated systemic fatigue relative to tolerance, 0–2ish. */
  readonly systemicRatio: number
}

/**
 * Whether it is time to deload, and whether the planned block length
 * should change for next time.
 *
 * Six weeks is the default because it is long enough for a volume ramp to
 * mean something and short enough that a bad block is not a lost quarter.
 * The bounds exist because a body that consistently needs a deload after
 * three weeks, or that never needs one inside ten, is telling you the
 * volume is wrong rather than the calendar.
 */
export function proposeDeload(performance: BlockPerformance): DeloadProposal {
  const { weeksCompleted, plannedWeeks } = performance

  const regressionRate =
    performance.totalSessions === 0 ? 0 : performance.regressedSessions / performance.totalSessions

  const overreached =
    regressionRate >= 0.4 ||
    performance.systemicRatio >= 1.1 ||
    performance.musclesFlaggingOverreach >= 3

  const cruising =
    weeksCompleted >= plannedWeeks &&
    regressionRate <= 0.1 &&
    performance.systemicRatio < 0.85 &&
    performance.musclesFlaggingOverreach === 0

  if (overreached && weeksCompleted >= MIN_WEEKS_BEFORE_DELOAD) {
    const proposed = Math.max(MIN_WEEKS_BEFORE_DELOAD, weeksCompleted)
    return {
      weeksCompleted,
      plannedWeeks,
      shouldDeloadNow: true,
      proposedWeeks: proposed,
      blocked: false,
      reason: `Performance and fatigue say this block is done at ${String(weeksCompleted)} weeks. Next block will plan for ${String(proposed)}.`,
    }
  }

  if (overreached && weeksCompleted < MIN_WEEKS_BEFORE_DELOAD) {
    // Deloading here is still the right call for the body; the *planned*
    // length is what must not move, because the cause is elsewhere.
    return {
      weeksCompleted,
      plannedWeeks,
      shouldDeloadNow: true,
      proposedWeeks: plannedWeeks,
      blocked: true,
      reason: `You are calling for a deload after only ${String(weeksCompleted)} weeks, below the ${String(MIN_WEEKS_BEFORE_DELOAD)}-week floor. Take it — but the block length is not the problem. Starting volume is probably too high, or systemic load from the big three is crowding out recovery.`,
    }
  }

  if (cruising) {
    const proposed = plannedWeeks + 1
    if (proposed > MAX_WEEKS_BEFORE_DELOAD) {
      return {
        weeksCompleted,
        plannedWeeks,
        shouldDeloadNow: true,
        proposedWeeks: plannedWeeks,
        blocked: true,
        reason: `You finished ${String(weeksCompleted)} weeks with no fatigue signal at all, and the block is already at the ${String(MAX_WEEKS_BEFORE_DELOAD)}-week ceiling. Deload anyway — but volume is likely too low to be driving adaptation. Raise your top-tier targets.`,
      }
    }

    return {
      weeksCompleted,
      plannedWeeks,
      shouldDeloadNow: true,
      proposedWeeks: proposed,
      blocked: false,
      reason: `Finished ${String(weeksCompleted)} weeks still fresh. Next block will run ${String(proposed)} weeks.`,
    }
  }

  if (weeksCompleted >= plannedWeeks) {
    return {
      weeksCompleted,
      plannedWeeks,
      shouldDeloadNow: true,
      proposedWeeks: plannedWeeks,
      blocked: false,
      reason: `Planned ${String(plannedWeeks)} weeks are done. Deload week next.`,
    }
  }

  return {
    weeksCompleted,
    plannedWeeks,
    shouldDeloadNow: false,
    proposedWeeks: plannedWeeks,
    blocked: false,
    reason: `Week ${String(weeksCompleted + 1)} of ${String(plannedWeeks)}. Fatigue is tracking normally.`,
  }
}

function minutesBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000))
}
