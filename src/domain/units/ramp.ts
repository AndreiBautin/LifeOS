import { BAR_WEIGHT, platesFor, PLATES, type BarKind } from './plates'
import type { WeightUnit } from './weight'

/**
 * Warm-up sets up to a working load.
 *
 * **The empty bar, then forty, sixty and eighty percent**, at falling
 * reps — ten, five, three, two. It is the ramp most strength coaches
 * write some version of, and the point of it is to rehearse the movement
 * at loads that cost nothing, not to add work: the reps fall as the bar
 * climbs so the last warm-up leaves the working sets fresh.
 *
 * **Every step is a load the plates can make.** Each is rounded down to
 * the nearest load the plates to hand load exactly, so a ramp on a home
 * set with no 2.5s never asks for 137.5. A step that rounds onto the one
 * before it, or up against the working load, is dropped rather than
 * repeated: two warm-ups at 135 is one warm-up written twice.
 */
export interface RampStep {
  readonly load: number
  readonly reps: number
}

const STEPS: readonly (readonly [share: number, reps: number])[] = [
  [0.4, 5],
  [0.6, 3],
  [0.8, 2],
]

export function warmupRamp(
  working: number,
  unit: WeightUnit,
  kind: BarKind = 'barbell',
  available: readonly number[] = PLATES[unit],
): readonly RampStep[] {
  const bar = BAR_WEIGHT[kind][unit]
  if (!Number.isFinite(working) || working <= bar) return []

  const smallest = Math.min(...available)
  const loadable = (target: number): number => {
    // Walk down in the smallest pair of plates until one loads exactly.
    for (let load = Math.floor(target); load > bar; load -= 0.25) {
      if (platesFor(load, unit, kind, available)?.leftover === 0) return load
    }
    return bar
  }

  const ramp: RampStep[] = [{ load: bar, reps: 10 }]
  for (const [share, reps] of STEPS) {
    const load = loadable(working * share)
    const previous = ramp.at(-1)?.load ?? bar
    if (load > previous + smallest && load < working - smallest) ramp.push({ load, reps })
  }
  return ramp
}
