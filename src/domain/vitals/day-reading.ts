/**
 * What a day was like, in the numbers another app already produced.
 *
 * The report: *"macro tracking shouldn't be prescriptive — I have Cal AI
 * for auto adjustments. I mainly want it for visibility and tracking,
 * the same way I want to track sleep, to feed into how the cut is going
 * and how the avatar is doing health-wise."*
 *
 * **This is not the food log this app has twice refused to build.** That
 * refusal stands and the reason has not changed: a calorie log needs a
 * database of foods and portions, it is the first thing to fall behind,
 * and everything derived from a stale one is quietly wrong. What is here
 * is **four numbers typed once**, off a screen in another app that did
 * the counting — the same shape as a weigh-in, which is a measurement
 * somebody reads off a scale rather than a thing this app computes.
 *
 * **Sleep belongs here for a reason the removed check-in already
 * stated.** `readinessScore` rated sleep as poor/ok/good, and the note
 * on its removal said the quiet part: *"sleep, nutrition and hydration
 * are quantities, and a quantity rated `ok` has been thrown away before
 * it was written down."* Hours is the quantity. This is that correction
 * arriving.
 *
 * **One record per day, not one per figure.** Sleep is entered in the
 * morning and macros at night, so they arrive at different moments and
 * must not blank each other — the rule `recordFinance` already follows,
 * where an empty box leaves a figure alone because there is no telling
 * "I did not check" from "I meant zero" once it is written, and only the
 * second corrupts a series.
 */

export interface DayReading {
  /**
   * `YYYY-MM-DD`, and the primary key.
   *
   * A **local** day key, like every other date here. One row per day, so
   * entering again corrects rather than appends — and the merge is
   * trivial for the reason a weigh-in's is: two devices holding a row
   * for one day are two opinions about one fact, which last-write-wins
   * settles correctly.
   */
  readonly day: string
  /** Hours slept. Absent when it was not recorded. */
  readonly sleepHours?: number
  /** Kilocalories eaten, as counted somewhere else. */
  readonly calories?: number
  readonly proteinGrams?: number
  readonly carbGrams?: number
  readonly fatGrams?: number
  readonly updatedAt?: string
}

/** The figures a day can carry, so a screen can loop rather than repeat. */
export const DAY_FIGURES = [
  'sleepHours',
  'calories',
  'proteinGrams',
  'carbGrams',
  'fatGrams',
] as const

export type DayFigure = (typeof DAY_FIGURES)[number]

export const DAY_FIGURE_LABELS: Readonly<Record<DayFigure, string>> = {
  sleepHours: 'Sleep',
  calories: 'Calories',
  proteinGrams: 'Protein',
  carbGrams: 'Carbs',
  fatGrams: 'Fat',
}

export const DAY_FIGURE_UNITS: Readonly<Record<DayFigure, string>> = {
  sleepHours: 'h',
  calories: 'kcal',
  proteinGrams: 'g',
  carbGrams: 'g',
  fatGrams: 'g',
}

/**
 * Sane bounds, refused rather than clamped.
 *
 * The rule the credit score already follows: quietly rounding a typo to
 * the top of a range would put a figure nobody produced into a series,
 * and a series is the one thing here that has to be trustworthy. A
 * mistyped 800-hour night is a mistake to reject, not to reshape.
 */
export const DAY_FIGURE_BOUNDS: Readonly<Record<DayFigure, { min: number; max: number }>> = {
  sleepHours: { min: 0, max: 24 },
  calories: { min: 0, max: 20_000 },
  proteinGrams: { min: 0, max: 2_000 },
  carbGrams: { min: 0, max: 2_000 },
  fatGrams: { min: 0, max: 2_000 },
}

export function isPlausible(figure: DayFigure, value: number): boolean {
  const { min, max } = DAY_FIGURE_BOUNDS[figure]

  return Number.isFinite(value) && value >= min && value <= max
}

/**
 * Merges figures into a day, leaving anything not mentioned alone.
 *
 * `undefined` in `changes` means "I did not say", and is the common case
 * — sleep in the morning, macros at night. **Clearing is a separate
 * word**: pass `null` to remove a figure, because a call site must not
 * be able to ask for "fill in what I know" and receive "wipe the rest",
 * which is the destructive/non-destructive split this codebase holds
 * everywhere.
 *
 * Returns the same object when nothing changed, so a repository can skip
 * a write and a device does not look newer than one that really moved.
 */
export function recordDay(
  existing: DayReading | undefined,
  day: string,
  changes: Partial<Record<DayFigure, number | null>>,
): DayReading {
  const base: DayReading = existing ?? { day }

  /*
   * The next value of each figure, worked out first and assembled after.
   * Clearing is an *omission* rather than a deleted key: under
   * `exactOptionalPropertyTypes` an absent field and one set to
   * undefined are different things, and only the first means "not
   * recorded".
   */
  const resolved = DAY_FIGURES.map((figure) => {
    const change = changes[figure]
    if (change === undefined) return { figure, value: base[figure] }
    if (change === null) return { figure, value: undefined }
    if (!isPlausible(figure, change)) return { figure, value: base[figure] }

    return { figure, value: change }
  })

  const moved = resolved.some(({ figure, value }) => value !== base[figure])
  if (!moved) return base

  return resolved.reduce<DayReading>(
    (reading, { figure, value }) =>
      value === undefined ? reading : { ...reading, [figure]: value },
    { day, ...(base.updatedAt === undefined ? {} : { updatedAt: base.updatedAt }) },
  )
}

/**
 * The mean of a figure over the readings that have it.
 *
 * **Absent, never zero**, and days with nothing recorded are skipped
 * rather than counted as a night of no sleep. A fortnight with three
 * entries is an average of three, which is honest; folding eleven zeros
 * in would report a catastrophe that did not happen.
 */
export function averageOf(readings: readonly DayReading[], figure: DayFigure): number | undefined {
  const values = readings
    .map((one) => one[figure])
    .filter((one): one is number => typeof one === 'number')

  if (values.length === 0) return undefined

  return Number((values.reduce((sum, one) => sum + one, 0) / values.length).toFixed(1))
}

/** How many of the last `days` have a figure at all. */
export function recordedCount(readings: readonly DayReading[], figure: DayFigure): number {
  return readings.filter((one) => typeof one[figure] === 'number').length
}
