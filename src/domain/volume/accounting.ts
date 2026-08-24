import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'

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
function countsAsWorking(set: SetPrescription): boolean {
  return set.isWarmup !== true
}

/**
 * What one slot's worth of sets contributes, per muscle.
 *
 * The primary muscle gets full credit; muscles the exercise trains
 * incidentally get a fraction. Counting secondaries at full value inflates
 * every total — five pressing days would show forty triceps sets and the
 * landmarks would become meaningless. Counting them at zero produces the
 * opposite error, where a lifter benching four times a week is told their
 * triceps need more direct work.
 */
export function slotVolume(exercise: Exercise, sets: readonly SetPrescription[]): VolumeMap {
  const volume = emptyVolumeMap()
  const workingSets = sets.filter(countsAsWorking).length
  if (workingSets === 0) return volume

  volume[exercise.primaryMuscle] += workingSets
  for (const secondary of exercise.secondaryMuscles) {
    if (secondary === exercise.primaryMuscle) continue
    volume[secondary] += workingSets * SECONDARY_SET_FRACTION
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
