/**
 * The bounds the schedule is set within.
 *
 * This module used to autoregulate the schedule itself — `proposeFrequency`
 * read recent session durations and recommended adding or removing a
 * training day, `proposeDeload` read block performance and recommended
 * when to deload. Both were written, both were tested, and neither was
 * ever called by anything. The Settings screen described them as live for
 * as long as they existed, which is the worst of both: a feature that
 * costs maintenance and delivers a claim rather than a behaviour.
 *
 * They are in the git history if the idea is wanted back. What survives
 * here is what the rest of the app actually reads: the bounds, and two
 * session-length landmarks the assembler's tests measure against.
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
export const DEFAULT_DAYS_PER_WEEK = 4

/**
 * Sessions running past this are a sign there are too few of them.
 *
 * Nothing acts on it. It is the line the assembler is held to in test:
 * a day past two hours is one nobody finishes as written, whatever the
 * volume arithmetic says.
 */
export const SESSION_TOO_LONG_MINUTES = 120

/**
 * Sessions this short mean the week could be consolidated.
 *
 * Forty, not sixty. Sixty was calibrated when four days was the default
 * and does not survive the move to five: the same weekly volume spread
 * over five sittings averages the middle fifties.
 *
 * Also nothing acts on it, and deliberately — a squat day with the legs
 * on maintenance finishing in forty minutes is the plan rather than a
 * gap, and the three mechanisms that once padded such a day up to the
 * floor are gone. It survives as the line the *week's average* is held
 * to in test.
 */
export const SESSION_TOO_SHORT_MINUTES = 40

export const DEFAULT_WEEKS_BEFORE_DELOAD = 6
export const MIN_WEEKS_BEFORE_DELOAD = 4
export const MAX_WEEKS_BEFORE_DELOAD = 8
