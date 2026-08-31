import type { DayReading } from '@/domain/vitals/day-reading'
import { averageOf, recordedCount } from '@/domain/vitals/day-reading'

/**
 * What the recorded days say, and — carefully — what they do not.
 *
 * The ask was to feed sleep and intake into *how the cut is going* and
 * *how the avatar is doing health-wise*. The obvious build is a health
 * score, and it is the one thing that must not be built: the portrait's
 * own note already refuses **"a power rating, a gear score"** because
 * that is a fourth currency where the model has three on purpose, and
 * `docs/GAME_MODEL.md` bars a ladder that names no external standard.
 *
 * So the rule applied here is the one the credit score follows. **A
 * figure gets a verdict only where somebody outside this app published
 * the bands:**
 *
 * - **Sleep does.** Adults are advised 7 or more hours a night, with
 *   7–9 the commonly quoted range. Nothing this app does moves that,
 *   which is exactly what makes it a legitimate scale rather than an
 *   invented one.
 * - **Protein does, in the form already in this codebase** — grams per
 *   kilogram of bodyweight, which `macros.ts` derives. Comparing what
 *   was eaten against that is comparing two numbers the app already
 *   holds, not inventing a third.
 * - **Calories do not.** There is no universal figure at which somebody
 *   has eaten correctly; it depends on the person, the phase and the
 *   week. So calories are **reported and never judged** — the same
 *   footing net worth sits on, and for the same reason.
 *
 * Everything here is **absent when unmeasured**. A fortnight with no
 * entries has nothing to say, which is different from saying it went
 * badly.
 */

/**
 * The published adult sleep guidance, as bands.
 *
 * 7 hours is the American Academy of Sleep Medicine and Sleep Research
 * Society consensus floor for adults; 9 is the top of the range the
 * National Sleep Foundation quotes for 18–64. Stated as two numbers
 * rather than a curve because that is how the guidance is published, and
 * a curve would be this app inventing precision the source does not
 * have.
 */
export const SLEEP_HOURS = { enough: 7, ample: 9 } as const

export type SleepStanding = 'short' | 'enough' | 'ample'

export function sleepStanding(hours: number): SleepStanding {
  if (hours < SLEEP_HOURS.enough) return 'short'
  if (hours > SLEEP_HOURS.ample) return 'ample'

  return 'enough'
}

/**
 * Terse and parallel, because they sit in a column beside "Protein
 * short". "Short on sleep" wrapped onto two lines inside its badge and
 * made one row taller than the rest for no information.
 */
export const SLEEP_STANDING_LABELS: Readonly<Record<SleepStanding, string>> = {
  short: 'Sleep short',
  enough: 'Sleep enough',
  ample: 'Sleep long',
}

export interface SleepReading {
  readonly average: number
  /** How many days of the window this is made of. */
  readonly days: number
  readonly standing: SleepStanding
}

export interface ProteinReading {
  readonly average: number
  readonly days: number
  /** The figure `macros.ts` derives from bodyweight and phase. */
  readonly target: number
  readonly met: boolean
}

export interface CalorieReading {
  readonly average: number
  readonly days: number
}

export interface DayStanding {
  readonly sleep?: SleepReading
  readonly protein?: ProteinReading
  /** Reported, never judged. There is no published figure to judge it against. */
  readonly calories?: CalorieReading
}

export function dayStanding(
  readings: readonly DayReading[],
  proteinTarget: number | undefined,
): DayStanding {
  const sleepAverage = averageOf(readings, 'sleepHours')
  const proteinAverage = averageOf(readings, 'proteinGrams')
  const calorieAverage = averageOf(readings, 'calories')

  return {
    ...(sleepAverage === undefined
      ? {}
      : {
          sleep: {
            average: sleepAverage,
            days: recordedCount(readings, 'sleepHours'),
            standing: sleepStanding(sleepAverage),
          },
        }),
    /*
     * Protein needs both halves. Without a bodyweight there is no
     * target, and reporting "185 g" against nothing would be a number
     * with no question attached.
     */
    ...(proteinAverage === undefined || proteinTarget === undefined
      ? {}
      : {
          protein: {
            average: proteinAverage,
            days: recordedCount(readings, 'proteinGrams'),
            target: proteinTarget,
            met: proteinAverage >= proteinTarget,
          },
        }),
    ...(calorieAverage === undefined
      ? {}
      : { calories: { average: calorieAverage, days: recordedCount(readings, 'calories') } }),
  }
}

/**
 * What the cut is actually running on, as a statement of two facts.
 *
 * **This is the one place the new figures touch the phase, and it adds
 * no judgement of its own.** The verdict on the scale is still
 * `phaseVerdict` reading the trend; what this contributes is the
 * *intake that produced it*, which is the thing the app could never say
 * before because it did not know what was eaten.
 *
 * "Losing 0.6% a week on 2,400 kcal" is two measurements set beside each
 * other. It is deliberately not "so eat 2,200": that is the correction
 * this feature was asked to remove, and it would be arriving back
 * through the door it left by.
 *
 * Absent unless both halves exist, because half of it is not a sentence.
 */
export interface CutReading {
  readonly ratePerWeek: number
  readonly calories: number
  readonly days: number
}

export function cutReading(
  ratePerWeek: number | undefined,
  standing: DayStanding,
): CutReading | undefined {
  if (ratePerWeek === undefined || standing.calories === undefined) return undefined

  return {
    ratePerWeek,
    calories: standing.calories.average,
    days: standing.calories.days,
  }
}
