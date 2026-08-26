/**
 * A judgement about direction of travel, for everything with no real top.
 *
 * Most of life is this. "Level 12 Reader" is invented; "the backlog is two
 * months older than it was" is true. A rating therefore carries **no
 * level and no progress fraction** — not as an omission to be filled in
 * later, but because the absence is the whole point. Adding either would
 * promote it to a ladder, which is the second of the three rules in
 * docs/GAME_MODEL.md.
 *
 * The vocabulary is Dashboard's, deliberately unchanged, because phase 4
 * ports its evaluators onto this type and a translation layer between two
 * spellings of the same four outcomes is a place for a bug to live.
 */

/**
 * How a metric's success is measured. One per evaluator that phase 4
 * brings across from `Dashboard.Domain/Metrics/Evaluators`.
 */
export const RATING_DIRECTIONS = [
  'increase',
  'decrease',
  'stay-above',
  'stay-below',
  'stay-within-range',
] as const

export type RatingDirection = (typeof RATING_DIRECTIONS)[number]

/**
 * The flat outcome set every direction maps onto.
 *
 * Flat on purpose: whatever a strategy means by success, everything
 * downstream — a status dot, the character sheet, a monthly summary —
 * speaks these four and never asks which strategy produced them.
 */
export const RATING_OUTCOMES = ['improved', 'regressed', 'stagnant', 'insufficient-data'] as const

export type RatingOutcome = (typeof RATING_OUTCOMES)[number]

export const RATING_LABELS: Readonly<Record<RatingOutcome, string>> = {
  improved: 'Improved',
  regressed: 'Regressed',
  stagnant: 'Stagnant',
  'insufficient-data': 'Not enough data',
}

/**
 * How often a rating is expected to be looked at.
 *
 * Here rather than in a component because it is a decision, not a layout.
 * Dashboard was built as a ten-minutes-a-month app — no streaks, no
 * notifications, no guilt mechanics — and absorbing it into something
 * opened daily is exactly the circumstance in which that stance gets lost
 * by degrees. A monthly rating rendered on a daily surface shows its last
 * judgement; it does not acquire a streak because the page was opened.
 */
export const RATING_CADENCES = ['daily', 'weekly', 'monthly'] as const

export type RatingCadence = (typeof RATING_CADENCES)[number]

export interface Rating {
  readonly id: string
  readonly name: string
  /** What is being counted here — see the disjointness rule in `credit.ts`. */
  readonly source: string
  readonly unit: string
  readonly direction: RatingDirection
  readonly cadence: RatingCadence
  /** For `stay-above` and `stay-below`. */
  readonly threshold?: number
  /** For `stay-within-range`. */
  readonly range?: { readonly min: number; readonly max: number }
}

/**
 * Whether an outcome is a statement about the area at all.
 *
 * `insufficient-data` is not a bad month. It is the absence of a second
 * data point, and rendering it as a regression is how a rating starts
 * punishing somebody for having only just begun tracking something.
 */
export function isJudgement(outcome: RatingOutcome): boolean {
  return outcome !== 'insufficient-data'
}
