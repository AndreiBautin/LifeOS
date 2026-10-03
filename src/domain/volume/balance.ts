import type { MuscleGroup } from '@/domain/exercises/taxonomy'

import type { VolumeMap } from './accounting'

/**
 * Whether the training is lopsided: push against pull, quads against the
 * hinge, upper against lower — the three pairings where a routine most
 * often drifts one way without anybody choosing it.
 *
 * **Counted in sets over four calendar weeks**, by the same accounting
 * the week card uses (`loggedVolume`), because one week is noise — a
 * missed pull day is not an imbalance — and four is a pattern.
 *
 * **Lean, not a verdict.** A powerlifter's week is meant to be
 * squat-heavy; what this says is which way and how far, and whether it
 * is moving. Even is within a tenth either side.
 */
export interface BalanceSide {
  readonly label: string
  readonly muscles: readonly MuscleGroup[]
}

export interface BalancePair {
  readonly key: string
  readonly left: BalanceSide
  readonly right: BalanceSide
}

const UPPER: readonly MuscleGroup[] = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'triceps',
  'lats',
  'upper-back',
  'traps',
  'biceps',
  'forearms',
]

export const BALANCE_PAIRS: readonly BalancePair[] = [
  {
    key: 'push-pull',
    left: { label: 'Push', muscles: ['chest', 'front-delts', 'triceps'] },
    right: { label: 'Pull', muscles: ['lats', 'upper-back', 'rear-delts', 'biceps'] },
  },
  {
    key: 'quads-hinge',
    left: { label: 'Quads', muscles: ['quads'] },
    right: { label: 'Hinge', muscles: ['hamstrings', 'glutes'] },
  },
  {
    key: 'upper-lower',
    left: { label: 'Upper', muscles: UPPER },
    right: { label: 'Lower', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  },
]

/** Within this of even, either way, reads as even. */
export const EVEN = 0.1

export interface Lean {
  readonly left: number
  readonly right: number
  /** −1 all left, 0 even, +1 all right; undefined with nothing on either side. */
  readonly lean: number | undefined
}

export interface PairBalance {
  readonly pair: BalancePair
  readonly total: Lean
  /** Each week, oldest first, so the drift can be drawn. */
  readonly weeks: readonly Lean[]
}

export function balanceOf(weeks: readonly VolumeMap[]): readonly PairBalance[] {
  return BALANCE_PAIRS.map((pair) => {
    const perWeek = weeks.map((week) => leanOf(sum(week, pair.left), sum(week, pair.right)))
    const left = perWeek.reduce((total, week) => total + week.left, 0)
    const right = perWeek.reduce((total, week) => total + week.right, 0)
    return { pair, total: leanOf(left, right), weeks: perWeek }
  })
}

function sum(week: VolumeMap, side: BalanceSide): number {
  return side.muscles.reduce((total, muscle) => total + week[muscle], 0)
}

function leanOf(left: number, right: number): Lean {
  const total = left + right
  return { left, right, lean: total === 0 ? undefined : (right - left) / total }
}

/** "Even", or which side and by how much: "Pull-heavy · 1.4×". */
export function describeLean(balance: PairBalance): string {
  const { left, right, lean } = balance.total
  if (lean === undefined) return 'Nothing logged'
  if (Math.abs(lean) <= EVEN) return 'Even'
  const heavy = lean > 0 ? balance.pair.right.label : balance.pair.left.label
  const ratio = lean > 0 ? right / Math.max(1, left) : left / Math.max(1, right)
  return `${heavy}-heavy · ${ratio.toFixed(1)}×`
}
