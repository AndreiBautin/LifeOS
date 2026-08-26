import type { MuscleGroup } from '@/domain/exercises/taxonomy'

/**
 * What a session has delivered so far, against what it set out to
 * deliver.
 *
 * This exists because the program's arithmetic contains an assumption it
 * cannot check. RTS back-off volume is *discovered* — you keep going
 * until the implied max has fallen by the day's allowance, which is four
 * sets on a good day and two on a bad one — but the assembler has to
 * materialise something, so it materialises the cap and counts all of it.
 * Everything downstream then plans as though every back-off will be
 * taken.
 *
 * The gap is not small and it is invisible. At two back-offs instead of
 * four the chest receives about thirteen sets where the plan claims
 * eighteen, and because the accessory fill *subtracts* what the strength
 * work spent, it also schedules fewer dips on the strength of volume that
 * never happened. Nothing is reported short; the week is simply lighter
 * than it claims.
 *
 * The answer is to stop predicting. A session knows its target, it knows
 * what has been logged, and the difference is a number a lifter can act
 * on while still in the gym — one more set of dips, or not, but chosen
 * rather than assumed.
 *
 * Deliberately no accounting of its own. `loggedVolume` already credits a
 * performed set and `slotVolume` credits a planned one, by the same
 * rules; a third implementation here would be the third place a change to
 * how credit works has to be remembered.
 */

export interface MuscleProgress {
  readonly muscle: MuscleGroup
  /** Credited sets this day set out to deliver. */
  readonly target: number
  /** Credited so far, from sets actually performed. */
  readonly done: number
  /** Never negative. Zero once the target is met. */
  readonly remaining: number
}

/**
 * Where the session stands, for the muscles it was built to train.
 *
 * Only muscles the day carries a target for. A session pays a dozen
 * incidentally, and listing all of them turns a glanceable answer into a
 * table nobody reads between sets — the question is "am I done", asked
 * about the two or three muscles the day is *for*.
 *
 * Sorted by what is still owed, so the one worth acting on is first.
 */
export function sessionProgress(
  targets: Readonly<Partial<Record<MuscleGroup, number>>>,
  done: Readonly<Partial<Record<MuscleGroup, number>>>,
): readonly MuscleProgress[] {
  const rows: MuscleProgress[] = []

  for (const [muscle, target] of Object.entries(targets) as [MuscleGroup, number][]) {
    if (target <= 0) continue

    const performed = round(done[muscle] ?? 0)

    rows.push({
      muscle,
      target: round(target),
      done: performed,
      remaining: round(Math.max(0, target - performed)),
    })
  }

  return rows.sort((a, b) => b.remaining - a.remaining || a.muscle.localeCompare(b.muscle))
}

/**
 * One decimal place.
 *
 * Credit is fractional — half a set for a secondary muscle, four fifths
 * for a set at RPE 8 — and the raw numbers carry floating-point noise
 * that surfaces as "5.999999999999999 of 6" somewhere it is read
 * one-handed between sets.
 */
function round(value: number): number {
  return Math.round(value * 10) / 10
}
