import { convertWeight, type WeightUnit } from './weight'

/**
 * A session's volume as something you could picture.
 *
 * "18,240 lb" is a number nobody can feel; "about one T. rex" is. The
 * report puts one beside the other so the total reads as a weight rather
 * than as arithmetic.
 *
 * **The reference is the heaviest thing the total covers**, so the count
 * is always at least one and the picture is never "0.2 school buses". The
 * masses are round public figures, labelled as approximations by the
 * sentence that uses them, and held in kilograms so a pound total and a
 * kilo total land on the same object.
 */

export interface Heft {
  readonly name: string
  readonly plural: string
  readonly kg: number
}

/** Ascending by mass. */
export const HEFTS: readonly Heft[] = [
  { name: 'grand piano', plural: 'grand pianos', kg: 450 },
  { name: 'family car', plural: 'family cars', kg: 1_500 },
  { name: 'African elephant', plural: 'African elephants', kg: 6_000 },
  { name: 'T. rex', plural: 'T. rexes', kg: 8_000 },
  { name: 'school bus', plural: 'school buses', kg: 11_000 },
  { name: 'humpback whale', plural: 'humpback whales', kg: 30_000 },
  { name: 'Boeing 737', plural: 'Boeing 737s', kg: 41_000 },
]

export interface HeftComparison {
  readonly heft: Heft
  /** One decimal under ten, whole above — "2.3 elephants", "14 pianos". */
  readonly count: number
}

/** Undefined when the total is lighter than the smallest reference. */
export function heftOf(total: number, unit: WeightUnit): HeftComparison | undefined {
  const kg = convertWeight(total, unit, 'kg')
  const heft = [...HEFTS].reverse().find((candidate) => candidate.kg <= kg)
  if (heft === undefined) return undefined
  const ratio = kg / heft.kg
  return { heft, count: ratio < 10 ? Math.round(ratio * 10) / 10 : Math.round(ratio) }
}

export function describeHeft({ heft, count }: HeftComparison): string {
  return `${String(count)} ${count === 1 ? heft.name : heft.plural}`
}
