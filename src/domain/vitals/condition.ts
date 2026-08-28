import {
  READINESS_RANGE,
  readinessScore,
  type ReadinessFactors,
} from '@/domain/autoregulation/check-in'

/**
 * How the day feels, recorded once a day rather than once a session.
 *
 * `ReadinessFactors` already existed and was **unreachable from any
 * screen** — the exact shape of defect this codebase treats as one, a
 * rule nothing can trip. It was asked for before a workout, which meant
 * it was never asked on a rest day and never asked at all, because the
 * pre-session check-in has no UI.
 *
 * So the factors are reused rather than reinvented. A second, smaller
 * set of daily questions would be two spellings of one idea, and the
 * moment this feeds `sessionAdjustmentFor` there would have to be a
 * translation between them for a bug to live in.
 *
 * The distinction that survives from the original design is the one
 * worth keeping: **this scales a day, never the settings.** A bad night
 * is a reason to cut today's volume and is not evidence that a muscle's
 * weekly tolerance has changed.
 */
export interface DayCondition {
  /** `YYYY-MM-DD`, and the primary key — one reading a day. */
  readonly day: string
  readonly readiness: ReadinessFactors
  readonly updatedAt?: string
}

/**
 * The condition bar, `0` to `1`.
 *
 * A fraction rather than a score out of ten, because it is drawn as a
 * bar and nothing else reads it. It is **self-reported and says so on
 * the screen** — which is the reason it is kept apart from the charges
 * bar rather than averaged with it. One is a count of things that
 * happened; this is how you said you felt, and a single blended number
 * would let the honest half be moved by the half you can simply decide.
 */
export function conditionFraction(readiness: ReadinessFactors): number {
  const span = READINESS_RANGE.max - READINESS_RANGE.min

  return (readinessScore(readiness) - READINESS_RANGE.min) / span
}

export const NEUTRAL_READINESS: ReadinessFactors = {
  sleep: 'ok',
  nutrition: 'ok',
  hydration: 'ok',
  stress: 'ok',
  motivation: 'ok',
}
