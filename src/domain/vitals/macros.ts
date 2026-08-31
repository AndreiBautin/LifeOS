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
  /*
   * `adjustment` used to live here and is gone.
   *
   * The report: *"macro tracking shouldn't be prescriptive — I have Cal
   * AI for auto adjustments. I mainly want it for visibility."* So the
   * app stopped correcting the number: what it reports is the intake
   * that was stated, broken down, and the trend and phase are read
   * beside it rather than folded into an instruction.
   *
   * `dailyAdjustment` and `MAX_DAILY_ADJUSTMENT` went with it rather
   * than being left unused. Keeping sound arithmetic that nothing calls
   * is how this codebase ends up with a fifth `proposeLandmarks`, and
   * the git history holds it perfectly well.
   *
   * Two things to know before reinstating it. It aimed at the **nearest
   * edge** of the phase band, never the middle — aiming at the centre
   * tells somebody losing at 0.45%/wk against a 0.5–1.0% target to cut
   * several times what the situation calls for. And it was capped at
   * 500 kcal, because one unrepresentative reading in a window produces
   * an arithmetically correct instruction to eat 1,400 fewer a day.
   */
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
 * A breakdown of the intake you stated, not a correction to it.
 *
 * **This reports; it does not prescribe.** Protein is grams per
 * kilogram, the fat floor is off bodyweight, and carbohydrate is the
 * remainder — all three are properties of the body and the phase rather
 * than judgements about how the last fortnight went. The trend and the
 * phase verdict are shown beside this and left as readings.
 */
export function macroTargets(input: MacroInput): MacroTargets | undefined {
  if (!Number.isFinite(input.bodyweight) || input.bodyweight <= 0) return undefined

  const kg = convertWeight(input.bodyweight, input.units, 'kg')

  const protein = Math.round(kg * PROTEIN_PER_KG[input.phase])
  const fat = Math.round(kg * FAT_FLOOR_PER_KG)

  if (input.intake === undefined || !Number.isFinite(input.intake) || input.intake <= 0) {
    return {
      protein,
      fat,
      floorsExceedCalories: false,
    }
  }

  const calories = Math.max(0, Math.round(input.intake / 10) * 10)
  const fromFloors = protein * KCAL_PER_G.protein + fat * KCAL_PER_G.fat
  const remaining = calories - fromFloors

  if (remaining < 0) {
    return {
      protein,
      fat,
      calories,
      floorsExceedCalories: true,
    }
  }

  return {
    protein,
    fat,
    calories,
    carbs: Math.round(remaining / KCAL_PER_G.carbs),
    floorsExceedCalories: false,
  }
}
