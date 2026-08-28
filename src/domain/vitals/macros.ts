import { convertWeight, type WeightUnit } from '@/domain/units/weight'

import type { Phase, PhaseVerdict, WeightTrend } from './weight'

/**
 * What to eat, derived rather than stored — and derived from the scale
 * rather than from a formula.
 *
 * The app cannot know your TDEE. Working it out needs intake data, and
 * intake is tracked in another app that already does it well; a second
 * food log here would duplicate that one and be the first thing to fall
 * behind, which would make everything derived from it quietly wrong.
 *
 * So this asks for **one number you already have** — the daily calorie
 * target you are currently eating to — and corrects it from the two
 * things the other app does not know: your smoothed weight trend and the
 * band your phase is aiming for. That is the same bargain RTS makes with
 * loads. A formula prescribing 2,280 kcal from height and age is a guess
 * within about 15% for any individual, and the trend has to correct it
 * anyway; starting from what you are actually eating skips the guess and
 * keeps the correction.
 *
 * The macros then follow from bodyweight, which is the only input they
 * genuinely need.
 */

/**
 * Protein, in grams per kilogram of bodyweight.
 *
 * The well-supported range for a trained lifter is roughly 1.6–2.2 g/kg,
 * and the top of it is where a deficit belongs: protein is what
 * preserves lean mass when energy is short, and the cost of overshooting
 * it is a little less room for carbohydrate. There is no comparable case
 * for the top of the range in a surplus, where the energy is already
 * there.
 *
 * Held in g/kg rather than g/lb because that is how the literature
 * states it. The lifter's own units are a presentation concern and
 * `convertWeight` handles them at the edge — deriving in the display
 * unit would bake a rounding of the source figures into the model.
 */
export const PROTEIN_PER_KG: Record<Phase, number> = {
  cut: 2.2,
  maintain: 1.8,
  bulk: 1.8,
}

/**
 * The fat floor, in grams per kilogram.
 *
 * A floor rather than a target. Fat below roughly this is where hormonal
 * and fat-soluble-vitamin problems start being reported, and above it
 * the split between fat and carbohydrate is preference rather than
 * physiology — so the model states the floor it has a reason for and
 * lets the remainder be carbohydrate rather than inventing a ratio.
 */
export const FAT_FLOOR_PER_KG = 0.66

const KCAL_PER_G = { protein: 4, fat: 9, carbs: 4 } as const

/**
 * The energy in a kilogram of bodyweight, for turning a rate gap into
 * calories.
 *
 * The familiar 3,500 kcal per pound. It is an approximation and it is
 * worth knowing which way it is wrong: it describes *fat* mass, while
 * the first pounds of any change are largely water and glycogen. Over a
 * seven-day smoothed trend that mostly washes out, which is the reason
 * the trend is smoothed over a week before this ever sees it.
 */
const KCAL_PER_KG_BODYWEIGHT = 7716

/**
 * The most this will ever suggest changing in one go.
 *
 * A trend can be wrong — a week of travel, a bad scale, one reading in a
 * window — and the arithmetic will cheerfully turn that into "eat 1,400
 * fewer a day". A cap is what stops a measurement error becoming a
 * dangerous instruction, and the number is deliberately blunt: if the
 * true correction really is larger than this, arriving there over two
 * weeks is the right way to do it anyway.
 */
export const MAX_DAILY_ADJUSTMENT = 500

export interface MacroTargets {
  /** Grams. Always present, because bodyweight is all it needs. */
  readonly protein: number
  /** Grams, a floor rather than a target. */
  readonly fat: number
  /**
   * The corrected daily total, absent when no intake has been stated.
   *
   * Absent rather than zero, like every other reading in this app: "you
   * have not told me what you eat" is not "eat nothing".
   */
  readonly calories?: number
  /** Grams, absent for the same reason — a remainder needs a total. */
  readonly carbs?: number
  /**
   * How far the stated intake is being moved, in kcal a day.
   *
   * Zero when the trend is inside the band. Absent when there is no
   * trend to judge, which is a different thing and reads differently on
   * the screen: "on track" versus "not enough readings".
   */
  readonly adjustment?: number
  /**
   * True when protein and the fat floor alone exceed the calorie total.
   *
   * Surfaced rather than resolved. The arithmetic would give a negative
   * carbohydrate target, and the honest reading is not "eat zero carbs"
   * — it is that the calorie figure and the phase disagree, which is a
   * thing for a person to look at.
   */
  readonly floorsExceedCalories: boolean
}

export interface MacroInput {
  /** The smoothed weight if there is one, else whatever settings hold. */
  readonly bodyweight: number
  readonly units: WeightUnit
  readonly phase: Phase
  /**
   * The daily calorie target the lifter is currently eating to.
   *
   * Written `| undefined` rather than merely optional, like
   * `exploredRegionKm2` in settings and for the same reason: under
   * `exactOptionalPropertyTypes` a caller building this object by spread
   * has to be able to say "explicitly nothing", and absent and
   * explicitly-undefined mean the same thing here.
   */
  readonly intake?: number | undefined
  readonly trend?: WeightTrend | undefined
  readonly verdict: PhaseVerdict
  readonly range: { readonly min: number; readonly max: number }
}

/**
 * How many kcal a day to move, to bring the trend to the nearest edge of
 * the band.
 *
 * **The nearest edge, not the middle.** The band is a range of
 * acceptable answers, so the smallest change that lands inside it is the
 * correct advice — aiming for the centre would tell a lifter losing at
 * 0.45%/wk against a 0.5–1.0% target to cut twice as much as the
 * situation calls for.
 */
function dailyAdjustment(input: MacroInput): number | undefined {
  const rate = input.trend?.ratePerWeek
  if (rate === undefined) return undefined
  if (input.verdict === 'on-track') return 0

  const edge = rate < input.range.min ? input.range.min : input.range.max
  const gapPercent = edge - rate

  const kg = convertWeight(input.bodyweight, input.units, 'kg')
  const kgPerWeek = (gapPercent / 100) * kg
  const perDay = (kgPerWeek * KCAL_PER_KG_BODYWEIGHT) / 7

  const capped = Math.max(-MAX_DAILY_ADJUSTMENT, Math.min(MAX_DAILY_ADJUSTMENT, perDay))

  /*
   * To the nearest ten, rounding the *magnitude* rather than the signed
   * value. The inputs are a smoothed average and a rule of thumb, so a
   * target of 273 would claim a precision neither of them has.
   *
   * Rounding the signed value directly is the obvious version and is
   * subtly asymmetric: JavaScript rounds half toward positive infinity,
   * so -45 becomes -40 while +45 becomes +50 — the same size of error
   * corrected less firmly in a deficit than in a surplus, for no reason
   * anyone could state. Taking the sign off first makes the two
   * directions behave alike.
   */
  const rounded = Math.round(Math.abs(capped) / 10) * 10

  // `-0` is a real value here and renders as "-0". Normalised rather
  // than left for a formatter to trip over.
  return rounded === 0 ? 0 : Math.sign(capped) * rounded
}

export function macroTargets(input: MacroInput): MacroTargets | undefined {
  if (!Number.isFinite(input.bodyweight) || input.bodyweight <= 0) return undefined

  const kg = convertWeight(input.bodyweight, input.units, 'kg')

  const protein = Math.round(kg * PROTEIN_PER_KG[input.phase])
  const fat = Math.round(kg * FAT_FLOOR_PER_KG)

  const adjustment = dailyAdjustment(input)

  if (input.intake === undefined || !Number.isFinite(input.intake) || input.intake <= 0) {
    return {
      protein,
      fat,
      ...(adjustment === undefined ? {} : { adjustment }),
      floorsExceedCalories: false,
    }
  }

  const calories = Math.max(0, Math.round((input.intake + (adjustment ?? 0)) / 10) * 10)
  const fromFloors = protein * KCAL_PER_G.protein + fat * KCAL_PER_G.fat
  const remaining = calories - fromFloors

  if (remaining < 0) {
    return {
      protein,
      fat,
      calories,
      ...(adjustment === undefined ? {} : { adjustment }),
      floorsExceedCalories: true,
    }
  }

  return {
    protein,
    fat,
    calories,
    carbs: Math.round(remaining / KCAL_PER_G.carbs),
    ...(adjustment === undefined ? {} : { adjustment }),
    floorsExceedCalories: false,
  }
}
