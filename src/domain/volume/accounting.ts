import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'
import { MAX_RPE, nominalReps } from '@/domain/programs/prescription'

import { emptyVolumeMap, SECONDARY_SET_FRACTION } from './landmarks'

/**
 * Counting hard sets per muscle.
 *
 * This is the arithmetic that makes the framework and the assistance
 * layer compose instead of merely coexist. A bench day under 5/3/1 BBB
 * already spends three main sets and five supplemental sets on the chest
 * before a single accessory exists — eight sets, plus four counted at
 * half toward the triceps and front delts. Assistance is therefore not a
 * fixed list; it is *the remainder* of the weekly target after the
 * framework has taken its share.
 *
 * Neither old app did this. StrengthFlow computed per-muscle volume for
 * its charts, but its check-in loop adjusted a stored number that had no
 * relationship to what the program actually prescribed, so the two
 * drifted apart immediately. LiftTracker never counted volume at all — it
 * assigned set counts from a hardcoded ramp and left the weekly total to
 * chance.
 */

export type VolumeMap = Record<MuscleGroup, number>

/** Warm-ups earn no credit. A 40% single for five is not a working set. */
export function countsAsWorking(set: SetPrescription): boolean {
  return set.isWarmup !== true
}

/**
 * How close to failure a set has to be taken to be worth a full one.
 *
 * Five reps, and what is counted is the reps taken *within five of
 * failure* rather than the reps performed. Those are the ones the
 * stimulus tracks; a set that stops well short contains fewer of them
 * whatever its rep count says.
 */
export const FULL_CREDIT_REPS = 5

/**
 * Reps in reserve that cost a set nothing.
 *
 * The landmarks are published in *hard sets*, and a hard set in that
 * literature means one taken to roughly a rep short of failure — not one
 * taken to failure. So a set at RPE 9 has to keep full credit, or the
 * unit the targets are expressed in quietly changes and every number in
 * the app shifts underneath them.
 *
 * Discounting starts past that. It is the difference between saying "a
 * set stopped well short of failure is worth less" and saying "every set
 * anybody actually programs is worth less", and only the first is a
 * claim about training.
 */
const FREE_RIR = 1

/**
 * How much of a hard set this is worth, from its reps and its RPE.
 *
 * Two things shorten a set's contribution and they are easy to conflate.
 * **Reps** was already here: a heavy triple simply contains fewer
 * stimulating reps than a set of eight. **Proximity to failure** was not,
 * and it is what made a competition lift's volume read wrong — five reps
 * at RPE 8 and five at RPE 10 both counted as one full set, so fifteen
 * bench sets covered a chest target on their own and the assembler
 * concluded the chest needed no direct work at all.
 *
 * The fix is not "strength work counts half". Half is a number with
 * nothing behind it, and it would discount a heavy set of five taken to
 * failure — which really is a full hypertrophy set — by the same amount
 * as one stopped two reps short. What actually differs is where the set
 * ends: at 2 RIR the last five reps span 6 to 2 away from failure, and
 * only three of them are inside the window. That is 0.6, arrived at
 * rather than chosen.
 *
 * Capped at one, because a set of twenty is not four sets: past the
 * window the limit is fatigue, not stimulus.
 */
export function hypertrophyCredit(reps: number, rpe?: number): number {
  if (reps <= 0) return 0

  const rir = rpe === undefined ? 0 : Math.max(0, MAX_RPE - rpe)
  const stimulating = Math.min(reps, FULL_CREDIT_REPS - Math.max(0, rir - FREE_RIR))

  return Math.max(0, Math.min(1, stimulating / FULL_CREDIT_REPS))
}

/**
 * The RPE a set is expected to finish at, where that is knowable.
 *
 * A back-off block has no prescribed RPE — the whole point is that the
 * reading is an output — but it does have a *stopping* RPE, which is
 * where the last set lands and a fair stand-in for the block. Anything
 * with no RPE at all is credited in full rather than guessed at.
 */
function expectedRpe(load: SetPrescription['load']): number | undefined {
  switch (load.kind) {
    case 'rpe':
      return load.target
    case 'rts-backoff':
      return load.stopRpe
    case 'percent-e1rm':
    case 'bodyweight':
    case 'absolute':
    case 'open':
      return undefined
  }
}

/**
 * What one slot's worth of sets contributes, per muscle.
 *
 * Two fractions apply, for different reasons. The primary muscle gets
 * full credit and muscles the exercise trains incidentally get half:
 * counting secondaries at full value inflates every total until the
 * landmarks are meaningless, and counting them at zero tells a lifter
 * benching four times a week that their triceps need more direct work.
 *
 * On top of that, a low-rep set is worth less than a full one — see
 * {@link hypertrophyCredit}. That is what stops a heavy triple counting
 * the same as a set of ten toward a muscle's weekly growth target.
 */
export function slotVolume(exercise: Exercise, sets: readonly SetPrescription[]): VolumeMap {
  const volume = emptyVolumeMap()

  const credited = sets
    .filter(countsAsWorking)
    .reduce(
      (total, set) => total + hypertrophyCredit(nominalReps(set.reps), expectedRpe(set.load)),
      0,
    )

  if (credited === 0) return volume

  volume[exercise.primaryMuscle] += credited
  for (const secondary of exercise.secondaryMuscles) {
    if (secondary === exercise.primaryMuscle) continue
    volume[secondary] += credited * SECONDARY_SET_FRACTION
  }

  return volume
}

export function addVolume(a: VolumeMap, b: VolumeMap): VolumeMap {
  const total = emptyVolumeMap()
  for (const muscle of Object.keys(total) as MuscleGroup[]) {
    total[muscle] = a[muscle] + b[muscle]
  }
  return total
}

export function sumVolume(maps: readonly VolumeMap[]): VolumeMap {
  return maps.reduce<VolumeMap>(addVolume, emptyVolumeMap())
}

/** Subtracts, floored at zero — a muscle cannot owe negative sets. */
export function subtractVolume(target: VolumeMap, spent: VolumeMap): VolumeMap {
  const remaining = emptyVolumeMap()
  for (const muscle of Object.keys(remaining) as MuscleGroup[]) {
    remaining[muscle] = Math.max(0, target[muscle] - spent[muscle])
  }
  return remaining
}

export interface CountableSlot {
  readonly exerciseId: ExerciseId
  readonly sets: readonly SetPrescription[]
}

/** Total volume across a collection of slots, given a way to look exercises up. */
export function volumeForSlots(
  slots: readonly CountableSlot[],
  lookup: (id: ExerciseId) => Exercise | undefined,
): VolumeMap {
  const contributions: VolumeMap[] = []

  for (const slot of slots) {
    const exercise = lookup(slot.exerciseId)
    // An unresolvable exercise contributes nothing rather than being
    // guessed at. A wrong attribution is worse than a missing one,
    // because the landmarks are what the assistance filler trusts.
    if (exercise === undefined) continue
    contributions.push(slotVolume(exercise, slot.sets))
  }

  return sumVolume(contributions)
}

/** Muscles carrying any volume at all, for display. */
export function trainedMuscles(volume: VolumeMap): readonly MuscleGroup[] {
  return (Object.keys(volume) as MuscleGroup[])
    .filter((muscle) => volume[muscle] > 0)
    .sort((a, b) => volume[b] - volume[a])
}

/** Rounds a fractional total for display without losing a half set to zero. */
export function displaySets(value: number): string {
  const rounded = Math.round(value * 2) / 2
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
