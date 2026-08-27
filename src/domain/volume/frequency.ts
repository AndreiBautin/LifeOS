import { MAX_SESSIONS_PER_WEEK, MAX_SETS_PER_SESSION } from '@/domain/volume/levels'

/**
 * What is left of a module that used to decide frequency.
 *
 * Frequency was derived here — a tier chose it, and a per-session ceiling
 * and a weekly maximum were derived from it in turn. All three are now
 * settings a lifter states directly: sessions a week per muscle, and sets
 * per session per level. There is nothing left to derive.
 *
 * The two constants are re-exported rather than moved so the many call
 * sites that reason about "a session's worth" keep reading naturally;
 * `levels.ts` is where they are defined and where the reasoning lives.
 */
export { MAX_SESSIONS_PER_WEEK, MAX_SETS_PER_SESSION }

/** Kept under its old name: five direct sets is one session's worth. */
export const MAX_DIRECT_SETS_PER_SESSION = MAX_SETS_PER_SESSION

/**
 * How many sessions this muscle's target should be split across.
 *
 * The ask, held to the days that could actually deliver it. A muscle
 * wanting three sessions on a split with two upper days gets two — the
 * shortfall is real and is reported on the Plan screen rather than
 * silently rounded away here.
 */
export function requiredFrequency(sessionsPerWeek: number, daysAvailable: number): number {
  if (daysAvailable <= 0) return 0
  return Math.min(daysAvailable, Math.max(0, sessionsPerWeek))
}

export function setsPerSession(weeklyTarget: number, frequency: number): number {
  if (frequency <= 0) return 0
  return Math.min(MAX_DIRECT_SETS_PER_SESSION, Math.ceil(weeklyTarget / frequency))
}
