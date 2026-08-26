import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutLog } from '@/domain/logging/workout-log'

import { indexTombstones, shouldAccept, type Tombstone } from './tombstone'

/**
 * A batch of changes moving in one direction.
 *
 * Deliberately the same four collections the backup envelope carries, and
 * deliberately *not* the envelope itself — a backup is a complete
 * snapshot with a checksum over the whole of it, and a sync batch is a
 * partial one. Reusing the envelope would have meant a checksum that
 * could not be checked and a "complete" file that was not.
 *
 * Position is absent, as it is from the envelope. It is the one record
 * with no correct last-write-wins answer — two devices advancing a single
 * cursor cannot be reconciled by comparing timestamps — so it stays
 * device-local, which is what makes everything else here safely
 * mergeable.
 */
export interface SyncPayload {
  readonly exercises: readonly Exercise[]
  readonly workouts: readonly WorkoutLog[]
  readonly checkIns: readonly CheckIn[]
  readonly tombstones: readonly Tombstone[]
}

export const EMPTY_PAYLOAD: SyncPayload = {
  exercises: [],
  workouts: [],
  checkIns: [],
  tombstones: [],
}

export function isEmpty(payload: SyncPayload): boolean {
  return (
    payload.exercises.length === 0 &&
    payload.workouts.length === 0 &&
    payload.checkIns.length === 0 &&
    payload.tombstones.length === 0
  )
}

export function payloadSize(payload: SyncPayload): number {
  return (
    payload.exercises.length +
    payload.workouts.length +
    payload.checkIns.length +
    payload.tombstones.length
  )
}

/**
 * The part of an incoming batch that survives everything known to be
 * deleted — both what this device deleted and what the batch itself says
 * was deleted.
 *
 * Both halves are needed. Filtering only on local tombstones lets a
 * record the *other* device deleted live on here forever, because this
 * device never witnessed the deletion and has nothing to compare against.
 * Filtering only on the incoming ones undoes local deletions, which is
 * the bug this whole mechanism exists to prevent.
 */
export function acceptableFrom(
  incoming: SyncPayload,
  localTombstones: readonly Tombstone[],
): SyncPayload {
  const index = indexTombstones([...localTombstones, ...incoming.tombstones])

  return {
    exercises: incoming.exercises.filter((item) => shouldAccept(item, 'exercises', item.id, index)),
    workouts: incoming.workouts.filter((item) => shouldAccept(item, 'workouts', item.id, index)),
    checkIns: incoming.checkIns.filter((item) => shouldAccept(item, 'checkIns', item.id, index)),
    tombstones: incoming.tombstones,
  }
}

/**
 * Records changed strictly after a watermark.
 *
 * Compared against the *local* clock on both sides, which is safe only
 * because this selects what to send rather than what to keep: every
 * `updatedAt` involved was written by this device. Deciding what to
 * *receive* uses a cursor the target issues, for exactly the reason this
 * cannot — two devices' clocks disagree, and a phone running four minutes
 * fast would otherwise hide four minutes of the desktop's work.
 */
export function changedSince<T extends { readonly updatedAt?: string }>(
  records: readonly T[],
  watermark: string | undefined,
): readonly T[] {
  /*
   * No `updatedAt` means the record was never written by this app's save
   * path, and shipped content is not a device's to send.
   *
   * This used to return everything when there was no watermark, which
   * reads as the obviously right answer for a first sync and is not: the
   * exercise library is *derived*, so `all()` hands back the whole
   * built-in catalogue alongside a lifter's own entries. A first sync
   * therefore uploaded thirty-five exercises that ship with the app,
   * keyed by slugs that are identical on every install — so two devices
   * wrote to the same documents, each overwrote the other, and each then
   * skipped them on pull as its own writes. Both reported sending ninety
   * records and receiving nothing, from databases holding no sessions at
   * all.
   *
   * The stamp is the right test rather than a filter on `isBuiltIn`,
   * because it generalises: a retired built-in that a lifter archived was
   * written by `save`, carries a stamp, and *should* travel to their
   * other device.
   */
  return records.filter(
    (record) =>
      record.updatedAt !== undefined && (watermark === undefined || record.updatedAt > watermark),
  )
}

export function deletedSince(
  tombstones: readonly Tombstone[],
  watermark: string | undefined,
): readonly Tombstone[] {
  if (watermark === undefined) return tombstones

  return tombstones.filter((tombstone) => tombstone.deletedAt > watermark)
}
