import { invariant } from '@/domain/errors/domain-error'
import type { SetPrescription } from '@/domain/programs/prescription'

/**
 * The 5/3/1 strength framework.
 *
 * None of the three source repositories contained any of this — no
 * training max, no percentage prescription, no AMRAP set. It is written
 * from Wendler's published scheme, and everything in it is a default that
 * the program builder can overwrite, because the point of the exercise
 * was never to ship a locked preset.
 *
 * The whole framework reduces to: for each of four weeks, three main sets
 * at stated percentages of a training max, the last one taken for as many
 * reps as possible. That AMRAP set is the autoregulation signal — it is
 * what decides whether the training max moves up, holds, or resets, and
 * it is the reason a percentage-based program does not need an RPE field.
 */

export interface MainSetScheme {
  readonly percent: number
  readonly reps: number
  /** The last set of a week is normally an AMRAP; the deload week has none. */
  readonly isAmrap: boolean
}

export interface FiveThreeOneWeek {
  readonly label: string
  readonly isDeload: boolean
  readonly sets: readonly MainSetScheme[]
}

/**
 * The canonical four-week cycle.
 *
 * Week 4 is a deload: three straight sets, no AMRAP, and the whole point
 * is that it is easy. Both old apps modelled a deload only as "week 4 has
 * fewer sets", with no notion of reduced intensity.
 */
export const CANONICAL_531_WEEKS: readonly FiveThreeOneWeek[] = [
  {
    label: 'Week 1 — 5s',
    isDeload: false,
    sets: [
      { percent: 65, reps: 5, isAmrap: false },
      { percent: 75, reps: 5, isAmrap: false },
      { percent: 85, reps: 5, isAmrap: true },
    ],
  },
  {
    label: 'Week 2 — 3s',
    isDeload: false,
    sets: [
      { percent: 70, reps: 3, isAmrap: false },
      { percent: 80, reps: 3, isAmrap: false },
      { percent: 90, reps: 3, isAmrap: true },
    ],
  },
  {
    label: 'Week 3 — 5/3/1',
    isDeload: false,
    sets: [
      { percent: 75, reps: 5, isAmrap: false },
      { percent: 85, reps: 3, isAmrap: false },
      { percent: 95, reps: 1, isAmrap: true },
    ],
  },
  {
    label: 'Week 4 — Deload',
    isDeload: true,
    sets: [
      { percent: 40, reps: 5, isAmrap: false },
      { percent: 50, reps: 5, isAmrap: false },
      { percent: 60, reps: 5, isAmrap: false },
    ],
  },
]

/** Optional ramp before the working sets. Excluded from volume accounting. */
export const DEFAULT_WARMUP_SETS: readonly MainSetScheme[] = [
  { percent: 40, reps: 5, isAmrap: false },
  { percent: 50, reps: 5, isAmrap: false },
  { percent: 60, reps: 3, isAmrap: false },
]

/* -------------------------------------------------------------------- */
/* Supplemental work                                                     */
/* -------------------------------------------------------------------- */

export const SUPPLEMENTAL_STYLES = ['bbb', 'fsl', 'ssl', 'none'] as const
export type SupplementalStyle = (typeof SUPPLEMENTAL_STYLES)[number]

export const SUPPLEMENTAL_LABELS: Record<SupplementalStyle, string> = {
  bbb: 'Boring But Big — 5 × 10',
  fsl: 'First Set Last — repeat the opening percentage',
  ssl: 'Second Set Last — repeat the middle percentage',
  none: 'No supplemental work',
}

/** Whether the supplemental volume goes to the day's main lift or its pair. */
export type SupplementalLift = 'same' | 'opposite'

export interface SupplementalConfig {
  readonly style: SupplementalStyle
  readonly lift: SupplementalLift
  readonly sets: number
  readonly reps: number
  /**
   * Only used by Boring But Big — First and Second Set Last derive their
   * percentage from the week's own main sets, so overriding it there
   * would break the relationship the variant is named for.
   */
  readonly percent: number
  /**
   * Added to `percent` each time the cycle repeats. Wendler's BBB
   * progression climbs 50 → 60 across cycles, which is this field set to
   * 2.5 with a ceiling of 60.
   */
  readonly percentPerCycle: number
  readonly maxPercent: number
}

export const DEFAULT_BBB: SupplementalConfig = {
  style: 'bbb',
  lift: 'same',
  sets: 5,
  reps: 10,
  percent: 50,
  percentPerCycle: 2.5,
  maxPercent: 60,
}

/**
 * The percentage the supplemental sets are performed at for a given week.
 *
 * BBB carries its own percentage; the Set Last variants read one of the
 * week's main percentages, which is what makes them track the wave
 * automatically instead of needing four more numbers configured.
 */
export function supplementalPercent(
  config: SupplementalConfig,
  week: FiveThreeOneWeek,
  cycleNumber: number,
): number | undefined {
  switch (config.style) {
    case 'none':
      return undefined
    case 'bbb':
      return Math.min(
        config.maxPercent,
        config.percent + config.percentPerCycle * Math.max(0, cycleNumber - 1),
      )
    case 'fsl':
      return week.sets[0]?.percent
    case 'ssl':
      return week.sets[1]?.percent
  }
}

/* -------------------------------------------------------------------- */
/* Training max progression                                              */
/* -------------------------------------------------------------------- */

export interface TrainingMaxProgression {
  /** Added to upper-body training maxes when a cycle completes. */
  readonly upperIncrement: number
  /** Added to lower-body training maxes when a cycle completes. */
  readonly lowerIncrement: number
  /**
   * Below this many reps on the week-3 AMRAP set, the training max is cut
   * rather than raised. Wendler's rule is that failing to beat the
   * prescribed minimum means the max was too high.
   */
  readonly resetBelowAmrapReps: number
  /** What the training max is reset *to*, as a percentage of its current value. */
  readonly resetToPercent: number
}

export const DEFAULT_TM_PROGRESSION: TrainingMaxProgression = {
  upperIncrement: 5,
  lowerIncrement: 10,
  resetBelowAmrapReps: 1,
  resetToPercent: 90,
}

/* -------------------------------------------------------------------- */
/* Turning a week scheme into prescriptions                              */
/* -------------------------------------------------------------------- */

export function mainSetPrescriptions(
  week: FiveThreeOneWeek,
  options: { readonly includeWarmups: boolean },
): readonly SetPrescription[] {
  const warmups: SetPrescription[] = options.includeWarmups
    ? DEFAULT_WARMUP_SETS.map((set) => ({
        load: { kind: 'percent-training-max', percent: set.percent },
        reps: { kind: 'fixed', reps: set.reps },
        isWarmup: true,
      }))
    : []

  const working: SetPrescription[] = week.sets.map((set) => ({
    load: { kind: 'percent-training-max', percent: set.percent },
    reps: set.isAmrap ? { kind: 'amrap', minimum: set.reps } : { kind: 'fixed', reps: set.reps },
  }))

  return [...warmups, ...working]
}

export function supplementalPrescriptions(
  config: SupplementalConfig,
  week: FiveThreeOneWeek,
  cycleNumber: number,
): readonly SetPrescription[] {
  const percent = supplementalPercent(config, week, cycleNumber)
  if (percent === undefined) return []

  // A deload week that is followed by fifty hard reps is not a deload.
  if (week.isDeload) return []

  return Array.from({ length: config.sets }, () => ({
    load: { kind: 'percent-training-max' as const, percent },
    reps: { kind: 'fixed' as const, reps: config.reps },
  }))
}

export function validateWeeks(weeks: readonly FiveThreeOneWeek[]): void {
  invariant(weeks.length > 0, 'FRAMEWORK_NO_WEEKS', 'A cycle needs at least one week.')
  for (const week of weeks) {
    invariant(
      week.sets.length > 0,
      'FRAMEWORK_EMPTY_WEEK',
      `"${week.label}" has no main sets. A week with no main work should be removed, not left empty.`,
    )
    for (const set of week.sets) {
      invariant(
        set.percent > 0 && set.percent <= 150,
        'FRAMEWORK_PERCENT_RANGE',
        `"${week.label}" prescribes ${String(set.percent)}% of the training max, which is outside the supported range.`,
      )
      invariant(
        Number.isInteger(set.reps) && set.reps > 0,
        'FRAMEWORK_REPS_RANGE',
        `"${week.label}" prescribes ${String(set.reps)} reps, which must be a positive whole number.`,
      )
    }
  }
}
