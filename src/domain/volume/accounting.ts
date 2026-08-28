import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'
import type { SlotRole } from '@/domain/programs/program'

import { emptyVolumeMap } from './landmarks'

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
 * A working set counts as one set for the muscle it is programmed for.
 *
 * It used to count fractionally, twice over: scaled by reps and proximity
 * to failure, and paid out again at half value to every secondary mover.
 * Both were defensible and both are gone, because between them a single
 * set of dumbbell bench could land as 0.6 chest, 0.3 triceps and 0.3 front
 * delts — three numbers nobody could check against a training log,
 * arrived at by two multiplications nobody could see.
 *
 * What is lost is real and worth naming. A heavy triple now counts the
 * same as a set of ten, and a bench press pays the triceps nothing. The
 * first makes strength work look like more hypertrophy volume than it is;
 * the second makes pressing look like none for the triceps. Both errors
 * are now visible on the Plan screen rather than buried in a coefficient,
 * which is the trade: a model you can check by counting rows in a session,
 * instead of one that was more nearly right and impossible to audit.
 */
/**
 * Whether a slot's sets count as hypertrophy volume.
 *
 * Only work chosen *for* a muscle does. Three kinds of set are excluded
 * and each was miscounted before this existed:
 *
 *   - **Warm-ups**, already flagged on the set itself.
 *   - **Strength work.** A top set and three back-off triples is twelve
 *     reps at high load — a strength dose, close to nothing as
 *     hypertrophy — and counting it as eight sets covered the chest's
 *     whole target and left the week with no chest work at all.
 *   - **Conditioning.** Thirty sets of ten kettlebell swings is a half
 *     hour of conditioning, and it was arriving as *sixty glute sets a
 *     week* against a target of zero. A twenty-minute walk was quietly
 *     adding two sets of calves for the same reason.
 *
 * The conditioning case is the one that shows why a role check beats
 * judging by set count: the swings only became absurd when they were
 * prescribed as sets rather than as a block of time, and nothing about
 * the work had changed.
 */
export function countsAsHypertrophy(role: SlotRole): boolean {
  return role === 'hypertrophy' || role === 'assistance'
}

export function slotVolume(exercise: Exercise, sets: readonly SetPrescription[]): VolumeMap {
  const volume = emptyVolumeMap()

  const working = sets.filter(countsAsWorking).length
  if (working === 0) return volume

  volume[exercise.primaryMuscle] += working

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
