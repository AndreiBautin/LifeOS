import type { WeightUnit } from './weight'

/**
 * What goes on each side of the bar for a load.
 *
 * The plate loader in the session player draws this, so a lifter reads
 * "two 45s and a 10" off the screen instead of doing the arithmetic with
 * chalk on their hands between sets. It is pure and greedy — the largest
 * plate that still fits, repeatedly — because that is how a person loads
 * a bar, and a loading that is arithmetically equal but uses more small
 * plates would be correct and annoying.
 *
 * **The plate sets are a standard gym's**, not anybody's garage: lb from
 * 45 down to 2.5, kg from 25 down to 1.25. A load that cannot be made
 * exactly reports what is left over rather than rounding it away — a
 * screen that silently showed 227.5 as 225 would be loading a different
 * bar from the one logged.
 */

export type BarKind = 'barbell' | 'ez-bar'

export const BAR_WEIGHT: Readonly<Record<BarKind, Readonly<Record<WeightUnit, number>>>> = {
  barbell: { lb: 45, kg: 20 },
  // EZ bars vary more than straight bars; 25 lb / 10 kg is the common one.
  'ez-bar': { lb: 25, kg: 10 },
}

export const PLATES: Readonly<Record<WeightUnit, readonly number[]>> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
}

export interface Loading {
  /** The bar alone. */
  readonly bar: number
  /** Plates for one side, heaviest first — the order they go on. */
  readonly perSide: readonly number[]
  /** Load the plates could not make, per side. Nought for an exact loading. */
  readonly leftover: number
}

/**
 * Plates per side for `load` on `bar`, or undefined when the load is not
 * more than the bar — an empty bar, or a number that cannot be a barbell
 * load at all.
 */
export function platesFor(
  load: number,
  unit: WeightUnit,
  kind: BarKind = 'barbell',
  /**
   * The plates actually to hand — a home gym with no 35s, say. Defaults to
   * the standard set; whatever is passed is read heaviest first.
   */
  available: readonly number[] = PLATES[unit],
): Loading | undefined {
  const bar = BAR_WEIGHT[kind][unit]
  if (!Number.isFinite(load) || load < bar) return undefined

  // Worked in hundredths so 2.5 and 1.25 subtract exactly.
  let side = Math.round(((load - bar) / 2) * 100)
  const perSide: number[] = []

  for (const plate of [...available].sort((a, b) => b - a)) {
    const step = Math.round(plate * 100)
    while (side >= step) {
      perSide.push(plate)
      side -= step
    }
  }

  return { bar, perSide, leftover: side / 100 }
}

/**
 * The plates a stored list says are to hand, read back for a unit.
 *
 * A list saved under the other unit names plates that do not exist here,
 * and an empty list cannot load a bar at all — both read as the standard
 * set rather than as a gym with nothing in it.
 */
export function platesToHand(
  stored: readonly number[] | undefined,
  unit: WeightUnit,
): readonly number[] {
  const known = (stored ?? []).filter((plate) => PLATES[unit].includes(plate))
  return known.length === 0 ? PLATES[unit] : PLATES[unit].filter((plate) => known.includes(plate))
}
