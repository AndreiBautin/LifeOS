import { toDayKey } from '@/domain/time/day'

/**
 * Bodyweight over time, and whether it is going where you said.
 *
 * Deliberately **not** a food log. Calories are tracked in another app
 * and re-entering meals here would be a second, worse copy of something
 * that already works. What that app cannot tell you is the only thing
 * this one needs: the direction the scale is moving, and whether that
 * matches the phase you said you were in.
 *
 * So one number, entered when you weigh yourself, and everything else
 * derived from it.
 */

export interface WeighIn {
  /**
   * `YYYY-MM-DD`, and the primary key.
   *
   * One weight per day, so weighing again replaces rather than appends —
   * a second reading on the same morning is a correction, not evidence.
   * It also makes the merge trivial: two devices with a reading for the
   * same day are two opinions about one fact, which last-write-wins
   * settles correctly.
   */
  readonly day: string
  /** In the lifter's own units. Nothing here converts. */
  readonly weight: number
  readonly updatedAt?: string
}

export const PHASES = ['cut', 'maintain', 'bulk'] as const
export type Phase = (typeof PHASES)[number]

export const PHASE_LABELS: Record<Phase, string> = {
  cut: 'Cut',
  maintain: 'Maintain',
  bulk: 'Bulk',
}

/**
 * What each phase is trying to do to the scale, as a weekly percentage.
 *
 * Percentages rather than absolute weights, because a pound a week is a
 * different ask at 150 lb and at 250. These are the ranges commonly
 * given for a lifter trying to keep muscle on a cut and limit fat on a
 * bulk; they are a **default, not a claim** — the point of the band is
 * that it is a target you set, and `stay-within-range` is the rating
 * direction that judges it.
 *
 * Maintain is a band around zero rather than a point. A phase that can
 * only be satisfied by an exactly flat scale would read as failing every
 * month, and day-to-day water alone is larger than the signal.
 */
export const PHASE_RATES: Record<Phase, { readonly min: number; readonly max: number }> = {
  cut: { min: -1, max: -0.5 },
  maintain: { min: -0.25, max: 0.25 },
  bulk: { min: 0.25, max: 0.5 },
}

/**
 * How many days of readings the trend is smoothed over.
 *
 * Bodyweight moves several pounds a day on water, salt and what is
 * currently inside you, and none of that is the thing being measured. A
 * week is the shortest window that covers a full cycle of ordinary life
 * — a weekend, a heavy training day, a rest day — so it is the shortest
 * one whose movement means anything.
 */
export const TREND_DAYS = 7

export interface WeightTrend {
  /** The smoothed weight now. */
  readonly current: number
  /** The smoothed weight one window ago, absent when there is no history. */
  readonly previous?: number
  /**
   * Change as a percentage of bodyweight per week.
   *
   * Absent rather than zero when it cannot be computed, which is the
   * rule the whole review spine follows: a zero here would be the claim
   * that the scale has not moved, and "no readings yet" is not that.
   */
  readonly ratePerWeek?: number
  /** How many readings the current figure is averaged over. */
  readonly readings: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function mean(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  return values.reduce((total, value) => total + value, 0) / values.length
}

function within(weighIns: readonly WeighIn[], from: Date, to: Date): readonly number[] {
  const first = toDayKey(from)
  const last = toDayKey(to)

  return weighIns.filter((row) => row.day > first && row.day <= last).map((row) => row.weight)
}

/**
 * The smoothed weight and how fast it is moving.
 *
 * Two windows compared, rather than a line fitted through everything.
 * A regression over the whole phase is more sophisticated and answers
 * the wrong question: what a lifter needs to know on a Tuesday is
 * whether *this week* is going where it should, and a fit over ten weeks
 * is dominated by the first ones and barely moves when the current week
 * goes wrong.
 *
 * Both windows are averages of whatever readings actually fell in them.
 * There is no interpolation and no carrying a value forward — a week
 * with two weigh-ins is an average of two, and a week with none is
 * **absent**, not the last known weight repeated. A carried-forward
 * value would show a rate of zero for a fortnight of not weighing in,
 * which is a claim the readings do not support.
 */
export function weightTrend(weighIns: readonly WeighIn[], now: Date): WeightTrend | undefined {
  const window = TREND_DAYS * DAY_MS
  const recent = mean(within(weighIns, new Date(now.getTime() - window), now))

  if (recent === undefined) return undefined

  const before = mean(
    within(weighIns, new Date(now.getTime() - 2 * window), new Date(now.getTime() - window)),
  )

  const readings = within(weighIns, new Date(now.getTime() - window), now).length

  if (before === undefined || before === 0) return { current: recent, readings }

  return {
    current: recent,
    previous: before,
    ratePerWeek: ((recent - before) / before) * 100,
    readings,
  }
}

export const PHASE_VERDICTS = ['on-track', 'too-fast', 'too-slow', 'unknown'] as const
export type PhaseVerdict = (typeof PHASE_VERDICTS)[number]

/**
 * Whether the scale is doing what the phase asked.
 *
 * Three real answers and an honest fourth. `too-slow` and `too-fast` are
 * separate because they call for opposite corrections and because on a
 * cut the fast one is the one that costs you muscle — collapsing them
 * into "off target" would lose the half a lifter most needs to see.
 *
 * `unknown` is what "absent, never zero" looks like here. No readings is
 * not a flat week.
 */
export function phaseVerdict(
  trend: WeightTrend | undefined,
  range: { readonly min: number; readonly max: number },
): PhaseVerdict {
  if (trend?.ratePerWeek === undefined) return 'unknown'

  if (trend.ratePerWeek < range.min) return range.min < 0 ? 'too-fast' : 'too-slow'
  if (trend.ratePerWeek > range.max) return range.max > 0 ? 'too-fast' : 'too-slow'

  return 'on-track'
}

export const PHASE_VERDICT_LABELS: Record<PhaseVerdict, string> = {
  'on-track': 'On track',
  'too-fast': 'Moving too fast',
  'too-slow': 'Moving too slowly',
  unknown: 'Not enough readings',
}

export interface CorridorPoint {
  /** Days since the first reading in the window. */
  readonly day: number
  readonly low: number
  readonly high: number
}

/**
 * Where the scale *would* be, had the phase been held from day one.
 *
 * A corridor rather than a band, because the target is a **rate** and a
 * rate does not become a range of weights until it is anchored to a
 * starting point and a length of time. Two lines projected from the
 * first reading — one at each edge of the band — spread apart as the
 * weeks pass, and the actual line either stays between them or leaves.
 *
 * The anchor is the earliest reading in the window shown, and that is
 * the honest limitation to state: a single unrepresentative first
 * weigh-in shifts the whole corridor, so it is drawn as guidance beside
 * the trend rather than as a verdict. **`phaseVerdict` remains the
 * judgement**, and it reads the smoothed rate over the last fortnight
 * rather than a projection from one morning weeks ago. The corridor is
 * for looking at; the verdict is for deciding.
 */
export function projectCorridor(
  anchorWeight: number,
  days: number,
  range: { readonly min: number; readonly max: number },
): readonly CorridorPoint[] {
  if (!Number.isFinite(anchorWeight) || anchorWeight <= 0 || days <= 0) return []

  const at = (weeks: number, ratePercent: number) => anchorWeight * (1 + ratePercent / 100) ** weeks

  return Array.from({ length: days + 1 }, (_, day) => {
    const weeks = day / 7
    const a = at(weeks, range.min)
    const b = at(weeks, range.max)

    /*
     * Sorted rather than assumed. On a cut both edges are negative and
     * `min` is the *lower* weight; on a bulk both are positive and `min`
     * is the *upper* one. Naming them low and high by value keeps the
     * caller from having to know which phase it is drawing.
     */
    return { day, low: Math.min(a, b), high: Math.max(a, b) }
  })
}
