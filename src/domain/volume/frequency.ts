/**
 * How many sessions a muscle's weekly volume needs to be split across.
 *
 * Not a preference, and not tied to priority directly — it falls out of
 * the volume. A session can only use so many sets of one muscle before
 * the later ones stop adding stimulus and start adding only fatigue, so a
 * muscle asked for eighteen sets a week cannot take them in one sitting
 * whatever its tier says. Priority raises the weekly target, and the
 * target is what raises the frequency.
 *
 * This replaced a flat floor of two sessions, which had two faults. It
 * was the same number for a muscle owed four sets and one owed twenty-two
 * — the second is nine sets a session, which is most of a day's fatigue
 * spent on the far side of where it stops paying. And it was satisfied by
 * *any* contribution, including the half-credit a row pays the biceps, so
 * a muscle could read as trained five days a week while being trained
 * directly once.
 */

/**
 * Direct sets of one muscle worth doing in a single session.
 *
 * Roughly where the returns flatten in the literature RP works from. The
 * exact figure is arguable and the shape is not: there is a per-session
 * ceiling, it is well below a week's worth of volume for a prioritised
 * muscle, and pretending otherwise concentrates junk volume into one day.
 */
export const MAX_DIRECT_SETS_PER_SESSION = 6

/** Every muscle worth training at all is worth training twice. */
export const MINIMUM_WEEKLY_FREQUENCY = 2

/**
 * Sessions this weekly target should be spread across.
 *
 * Capped at the days available, because asking for four sessions of a
 * muscle in a three-day week is not a plan the split can honour, and a
 * frequency floor that cannot be met would have the filler add slots
 * forever trying.
 */
export function requiredFrequency(weeklyTarget: number, daysAvailable: number): number {
  if (weeklyTarget <= 0 || daysAvailable <= 0) return 0

  const needed = Math.ceil(weeklyTarget / MAX_DIRECT_SETS_PER_SESSION)
  return Math.min(daysAvailable, Math.max(MINIMUM_WEEKLY_FREQUENCY, needed))
}

/** Direct sets to put in one session, given how many sessions there are. */
export function setsPerSession(weeklyTarget: number, frequency: number): number {
  if (frequency <= 0) return 0
  return Math.min(MAX_DIRECT_SETS_PER_SESSION, Math.ceil(weeklyTarget / frequency))
}
