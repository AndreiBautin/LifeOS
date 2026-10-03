import type { Performance } from '@/domain/logging/versus-last'
import { roundLoad } from '@/domain/units/weight'

import type { E1rmFormula } from './one-rep-max'

/**
 * What an estimated max says you could lift for a given number of reps,
 * beside what you actually have.
 *
 * **The formula run backwards** — the same one the estimate came from, so
 * the 1RM row is the estimate and the rest follow from it — and rounded
 * down to a load that can be made. Beside each row, the heaviest bar ever
 * moved **in that row's bracket** — three or four reps for the triple row.
 * "At least that many" was tried and read badly: a set of five then
 * filled the single row at five-rep weight, under a prediction nobody had
 * attempted, and looked like a weakness. A row where the actual beats the
 * prediction is a rep range you are strong in, and one well below it is
 * the opposite. Past ten reps every formula drifts, which is why the
 * table stops at twelve.
 */
export const REP_COUNTS = [1, 3, 5, 8, 10, 12] as const

export interface RepMaxRow {
  readonly reps: number
  readonly predicted: number
  /** The heaviest load done for this row's reps (up to the next row's), if any. */
  readonly actual?: number
}

export function loadForReps(oneRepMax: number, reps: number, formula: E1rmFormula): number {
  if (reps <= 1) return oneRepMax
  switch (formula) {
    case 'epley':
      return oneRepMax / (1 + reps / 30)
    case 'brzycki':
      return oneRepMax * Math.max(0.05, 1.0278 - 0.0278 * reps)
    case 'lombardi':
      return oneRepMax / Math.pow(reps, 0.1)
  }
}

export function repMaxTable(
  oneRepMax: number,
  sets: readonly Performance[],
  formula: E1rmFormula,
  increment: number,
): readonly RepMaxRow[] {
  return REP_COUNTS.map((reps, at) => {
    const below = REP_COUNTS[at + 1] ?? Number.POSITIVE_INFINITY
    const done = sets
      .filter((set) => (set.reps ?? 0) >= reps && (set.reps ?? 0) < below && (set.load ?? 0) > 0)
      .map((set) => set.load ?? 0)
    const actual = done.length === 0 ? undefined : Math.max(...done)
    return {
      reps,
      predicted: roundLoad(loadForReps(oneRepMax, reps, formula), increment, 'down'),
      ...(actual === undefined ? {} : { actual }),
    }
  })
}
