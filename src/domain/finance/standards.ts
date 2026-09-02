/**
 * Where a net worth and a retirement balance stand against published
 * figures for somebody the same age.
 *
 * **This reverses a decision recorded in `registry.ts`, and the reversal
 * is narrower than it looks.** That note said net worth could not be a
 * ladder because "there is no published amount at which somebody has
 * finished having money", so levelling it would invent a scale the app
 * can move. The first half is still true — there is no finish line here,
 * and nothing below claims one.
 *
 * What was wrong was reading "no finish line" as "no external standard".
 * A powerlifting ladder has no finish line either: its levels come from
 * **where a lifter sits among lifters**, published as bodyweight
 * multiples. The same thing exists for money, is published by a rather
 * more official body, and this module is a copy of that arrangement.
 * Asked for as _"net worth and savings should be displayed too, look up
 * reasonable standards for a 32 year old."_
 *
 * **Two different standards, because the two questions are different.**
 * Net worth is read as a **percentile among households your age** —
 * descriptive, "where do I sit". Retirement is read against **the
 * benchmark for your age** — normative, "am I on track".
 *
 * Using the distribution for retirement as well would be tidier and is
 * useless: the median household aged 30-34 holds about $12,700 in
 * retirement accounts, so anybody contributing seriously lands at the
 * top of that ladder immediately and it stops telling them anything.
 *
 * **Both need a fact about you the app did not hold** — your age, and
 * for retirement your income. They are the same shape as
 * `settings.bodyweight`, which the strength ladders need for the same
 * reason: a standard expressed per person needs the person. With either
 * absent the ladder is **absent rather than zero**, the rule everywhere
 * else here.
 */

/** Whole dollars to the integer minor units money uses everywhere here. */
const dollars = (amount: number): number => amount * 100

interface NetWorthBracket {
  /** Inclusive lower bound of the age bracket. */
  readonly from: number
  /** Inclusive upper bound. */
  readonly to: number
  readonly p25: number
  readonly p50: number
  readonly p75: number
  readonly p90: number
}

/**
 * Household net worth by age, 2022 Survey of Consumer Finances.
 *
 * The Federal Reserve runs the SCF every three years and publishes the
 * **distribution** rather than a target, which is what a ladder wants:
 * nothing this app does can move it, and it sits on the same footing as
 * the FICO bands next door. The 2022 wave, released October 2023, is the
 * most recent published — the 2025 wave was still being collected.
 *
 * **Household, not individual, and that is a real limitation.** One
 * person's figure read against a household distribution reads low if
 * they live alone and share nothing. No arithmetic here can fix that, so
 * the screen says it rather than hiding it.
 *
 * In whole dollars as published, converted on the way out, so the table
 * can be checked against the source without decoding minor units.
 */
export const NET_WORTH_BY_AGE: readonly NetWorthBracket[] = [
  { from: 18, to: 24, p25: 88, p50: 10_222, p75: 33_898, p90: 184_516 },
  { from: 25, to: 29, p25: 3_784, p50: 31_470, p75: 130_606, p90: 296_830 },
  { from: 30, to: 34, p25: 11_016, p50: 88_631, p75: 186_140, p90: 538_750 },
  { from: 35, to: 39, p25: 16_548, p50: 138_588, p75: 389_432, p90: 864_340 },
  { from: 40, to: 44, p25: 23_812, p50: 134_382, p75: 436_892, p90: 1_182_580 },
  { from: 45, to: 49, p25: 47_668, p50: 213_586, p75: 680_298, p90: 1_428_714 },
  { from: 50, to: 54, p25: 54_414, p50: 266_140, p75: 913_012, p90: 2_576_540 },
  { from: 55, to: 59, p25: 84_977, p50: 321_074, p75: 1_137_318, p90: 2_672_160 },
  { from: 60, to: 64, p25: 80_372, p50: 392_860, p75: 1_131_122, p90: 3_042_280 },
  { from: 65, to: 69, p25: 68_972, p50: 393_480, p75: 1_154_552, p90: 2_961_060 },
  { from: 70, to: 74, p25: 124_757, p50: 438_700, p75: 1_234_946, p90: 2_999_396 },
  { from: 75, to: 79, p25: 89_504, p50: 338_180, p75: 991_520, p90: 2_914_188 },
  { from: 80, to: 200, p25: 95_230, p50: 327_200, p75: 944_334, p90: 2_540_500 },
]

/**
 * Fidelity's retirement-savings benchmark, as a multiple of salary.
 *
 * 1x by 30, 3x by 40, 6x by 50, 10x by 67, assuming retirement at 67 on
 * about 45% income replacement with Social Security carrying the rest.
 * A rule of thumb from a large provider rather than a government
 * statistic — but published, widely quoted, and **not something this app
 * can move**, which is the test a ladder has to pass.
 *
 * Interpolated between the published ages rather than stepped, so a
 * birthday does not jump somebody a whole level. Nothing between the
 * stated points is invented: a straight line between two published
 * figures is the least a curve through them could be doing.
 */
const RETIREMENT_MULTIPLES: readonly { readonly age: number; readonly multiple: number }[] = [
  { age: 25, multiple: 0.5 },
  { age: 30, multiple: 1 },
  { age: 35, multiple: 2 },
  { age: 40, multiple: 3 },
  { age: 45, multiple: 4 },
  { age: 50, multiple: 6 },
  { age: 55, multiple: 7 },
  { age: 60, multiple: 8 },
  { age: 67, multiple: 10 },
]

/**
 * Age in whole years, from a birth year and the clock.
 *
 * **Deliberately the difference of two calendar years**, which is out by
 * up to one until the birthday falls. A month and a day would be storing
 * a birthday to make a ladder half a percentile more accurate, and every
 * bracket here is five years wide.
 */
export function ageFromBirthYear(birthYear: number, now: Date): number {
  return now.getFullYear() - birthYear
}

function bracketFor(age: number): NetWorthBracket | undefined {
  return NET_WORTH_BY_AGE.find((one) => age >= one.from && age <= one.to)
}

/** Linear between two points, guarding a zero-width span. */
function between(
  value: number,
  lowIn: number,
  highIn: number,
  lowOut: number,
  highOut: number,
): number {
  if (highIn <= lowIn) return lowOut
  return lowOut + ((value - lowIn) / (highIn - lowIn)) * (highOut - lowOut)
}

/** The most a percentile ever reads, so the top of the ladder stays open. */
const TOP_PERCENTILE = 99

/**
 * Roughly which percentile a net worth sits at for its age, 0-100.
 *
 * Interpolated between the four published breakpoints, which is an
 * approximation of a curve from four of its points and is named as one.
 * What makes it honest enough to level on: **the ladder's thresholds are
 * the breakpoints themselves**, so the reading is exact at the four
 * places that decide a level, and the number in between is a readable
 * position rather than a claim to know the shape of the distribution.
 *
 * Above the 90th it approaches but never reaches 100, because a
 * percentile of exactly 100 would be the claim that nobody has more.
 */
export function netWorthPercentile(minorUnits: number, age: number): number | undefined {
  const bracket = bracketFor(age)
  if (bracket === undefined) return undefined

  const p25 = dollars(bracket.p25)
  const p50 = dollars(bracket.p50)
  const p75 = dollars(bracket.p75)
  const p90 = dollars(bracket.p90)

  /*
   * A negative net worth is a real position rather than an error — a
   * mortgage or a student loan puts plenty of people below zero — so it
   * reads as the bottom of the scale instead of being refused.
   */
  if (minorUnits <= 0) return 0
  if (minorUnits < p25) return between(minorUnits, 0, p25, 0, 25)
  if (minorUnits < p50) return between(minorUnits, p25, p50, 25, 50)
  if (minorUnits < p75) return between(minorUnits, p50, p75, 50, 75)
  if (minorUnits < p90) return between(minorUnits, p75, p90, 75, 90)

  /*
   * Asymptotic above the top published point: twice the 90th reads 94.5
   * and ten times reads 98.1. The scale keeps moving without ever
   * claiming to have found the end of it.
   */
  return TOP_PERCENTILE - (TOP_PERCENTILE - 90) * (p90 / minorUnits)
}

/** The multiple of salary the benchmark puts against this age. */
export function retirementMultipleFor(age: number): number {
  const first = RETIREMENT_MULTIPLES[0]
  const last = RETIREMENT_MULTIPLES[RETIREMENT_MULTIPLES.length - 1]
  if (first === undefined || last === undefined) return 0
  if (age <= first.age) return first.multiple
  if (age >= last.age) return last.multiple

  for (let index = 0; index < RETIREMENT_MULTIPLES.length - 1; index += 1) {
    const low = RETIREMENT_MULTIPLES[index]
    const high = RETIREMENT_MULTIPLES[index + 1]
    if (low === undefined || high === undefined) continue
    if (age >= low.age && age <= high.age) {
      return between(age, low.age, high.age, low.multiple, high.multiple)
    }
  }

  return last.multiple
}

/**
 * Retirement savings as a share of the benchmark for this age, where 1
 * is exactly on track.
 *
 * Absent without an income, because the benchmark is a multiple of one
 * and there is no honest default. A figure guessed here would put
 * somebody on a rung nothing measured, which is the one thing a ladder
 * must never do.
 */
export function retirementAgainstBenchmark(
  minorUnits: number,
  annualIncomeMinor: number | undefined,
  age: number,
): number | undefined {
  if (annualIncomeMinor === undefined || annualIncomeMinor <= 0) return undefined

  const wanted = annualIncomeMinor * retirementMultipleFor(age)
  if (wanted <= 0) return undefined

  return Math.max(0, minorUnits) / wanted
}

/**
 * Published individual income for ages 25-34, so a salary target can be
 * a real figure rather than one somebody made up at eleven at night.
 *
 * The question this answers came as _"we probably need to set some sort
 * of target for that then huh, any way to automate that."_ **The target
 * itself cannot be automated** — nothing here knows what you should earn
 * — and that is the same refusal every invented scale gets. What can be
 * automated is not having to invent the number: these are the Census
 * Bureau's own breakpoints, offered as one tap each, and the field stays
 * free text so any figure of your own still goes in.
 *
 * 2024 Annual Social and Economic Supplement, individual gross income,
 * ages 25-34. **One bracket, deliberately**: it is the one bracket whose
 * three breakpoints came from a single consistent cut of the survey, and
 * mixing a median from one vintage with quartiles from another to cover
 * more ages would make every figure here slightly untrue. Adding a
 * bracket is adding a row, and outside this range nothing is offered
 * rather than something being extrapolated.
 */
const INCOME_REFERENCES = {
  from: 25,
  to: 34,
  points: [
    { label: 'Median for 25-34', dollars: 48_000 },
    { label: '75th percentile', dollars: 75_000 },
    { label: '90th percentile', dollars: 115_000 },
  ],
} as const

export interface SalaryReference {
  readonly label: string
  readonly minorUnits: number
}

/**
 * Published salary figures worth aiming at, for an age, in minor units.
 *
 * Empty outside the bracket the table covers, which is the honest answer
 * rather than the nearest one: a suggestion is only worth offering if it
 * is a figure somebody published about people your age.
 */
export function salaryReferences(age: number): readonly SalaryReference[] {
  if (age < INCOME_REFERENCES.from || age > INCOME_REFERENCES.to) return []

  return INCOME_REFERENCES.points.map((point) => ({
    label: point.label,
    minorUnits: dollars(point.dollars),
  }))
}
