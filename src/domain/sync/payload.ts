import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { DailyProgressEntry } from '@/domain/backlog/daily-goal'
import type { Exercise } from '@/domain/exercises/exercise'
import type { Project } from '@/domain/projects/project'
import type { WorkoutLog } from '@/domain/logging/workout-log'

import type { SyncedSettings } from '@/domain/settings/synced'

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
  readonly items: readonly Item[]
  readonly projects: readonly Project[]
  readonly tombstones: readonly Tombstone[]
  /**
   * The travelling half of the settings, when they have changed.
   *
   * One blob rather than a collection, because there is one of them. It
   * is here at all because the program is *derived* from settings — two
   * devices with different tiers derive different programs, so syncing
   * history without the priorities that produced it is the half that only
   * looks like it works.
   *
   * Absent when nothing changed, and absent from anything a build without
   * this sent.
   */
  readonly settings?: SyncedSettings
}

export const EMPTY_PAYLOAD: SyncPayload = {
  exercises: [],
  workouts: [],
  checkIns: [],
  items: [],
  projects: [],
  tombstones: [],
}

export function isEmpty(payload: SyncPayload): boolean {
  return (
    payload.exercises.length === 0 &&
    payload.workouts.length === 0 &&
    payload.checkIns.length === 0 &&
    payload.items.length === 0 &&
    payload.projects.length === 0 &&
    payload.tombstones.length === 0 &&
    payload.settings === undefined
  )
}

export function payloadSize(payload: SyncPayload): number {
  return (
    payload.exercises.length +
    payload.workouts.length +
    payload.checkIns.length +
    payload.items.length +
    payload.projects.length +
    payload.tombstones.length +
    // Counted as one record, because that is what a lifter reading "sent
    // 3" is being told: three things moved, one of which was their
    // priorities.
    (payload.settings === undefined ? 0 : 1)
  )
}

/**
 * Merges two copies of one item's progress log, by day.
 *
 * The only place in this file where a *record's contents* are reconciled
 * rather than the record as a whole, and it is here because the general
 * rule genuinely does not apply.
 *
 * Whole-record last-write-wins is justified for a workout by how workouts
 * are used: you log sets on the phone in the gym and read the results at
 * your desk, so two devices editing one session is not a real scenario.
 * That reasoning does not transfer to a backlog. Reading a chapter on the
 * phone on Monday and an episode on the laptop on Tuesday — before the two
 * have spoken — is ordinary, and under a record-level winner Monday
 * silently vanishes: the laptop's copy is newer, and its progress log
 * never contained Monday at all.
 *
 * A progress log is append-only per day, so a union is the correct merge
 * and needs no timestamps. Where both copies claim the same day, the
 * larger count wins: neither device can have lost progress it recorded, so
 * the higher number is the one that saw more. The case that remains
 * imprecise is both devices logging the *same day* while apart, where two
 * separate readings show up as one — which is strictly better than the
 * record-level rule, under which the whole day disappears.
 */
export function unionProgress(
  mine: readonly DailyProgressEntry[],
  theirs: readonly DailyProgressEntry[],
): readonly DailyProgressEntry[] {
  const byDate = new Map<string, number>()

  for (const entry of [...mine, ...theirs]) {
    byDate.set(entry.date, Math.max(byDate.get(entry.date) ?? 0, entry.amount))
  }

  return [...byDate]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
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
  /**
   * The local copies of the items being received.
   *
   * Needed only so a progress log can be unioned *before* the record-level
   * winner is chosen — by the time a record has won, the loser's days are
   * already gone.
   */
  localItems: readonly Item[] = [],
): SyncPayload {
  const index = indexTombstones([...localTombstones, ...incoming.tombstones])
  const localById = new Map(localItems.map((item) => [item.id, item]))

  return {
    exercises: incoming.exercises.filter((item) => shouldAccept(item, 'exercises', item.id, index)),
    workouts: incoming.workouts.filter((item) => shouldAccept(item, 'workouts', item.id, index)),
    checkIns: incoming.checkIns.filter((item) => shouldAccept(item, 'checkIns', item.id, index)),
    items: incoming.items
      .filter((item) => shouldAccept(item, 'items', item.id, index))
      .map((item) => {
        const local = localById.get(item.id)
        if (local === undefined) return item

        return { ...item, dailyProgress: unionProgress(local.dailyProgress, item.dailyProgress) }
      }),
    projects: incoming.projects.filter((item) => shouldAccept(item, 'projects', item.id, index)),
    tombstones: incoming.tombstones,
    // Passed through untouched. Settings cannot be deleted, so there is
    // no tombstone that could apply to them.
    ...(incoming.settings === undefined ? {} : { settings: incoming.settings }),
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
