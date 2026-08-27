import {
  asBacklogItemId,
  asCheckInId,
  asExerciseId,
  asProjectId,
  asUpgradeId,
  asFriendId,
  asWorkoutId,
} from '@/domain/ids/ids'
import type {
  BacklogItemRepository,
  CheckInRepository,
  ProjectRepository,
  UpgradeRepository,
  FriendRepository,
  ReviewRepository,
  Clock,
  ExerciseRepository,
  SettingsRepository,
  SyncStateRepository,
  SyncTarget,
  TombstoneRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { mergeSettings, projectForSync } from '@/domain/settings/synced'
import {
  acceptableFrom,
  changedSince,
  deletedSince,
  payloadSize,
  type SyncPayload,
} from '@/domain/sync/payload'
import type { Tombstone } from '@/domain/sync/tombstone'

/**
 * One exchange with a sync target: send what changed here, take what
 * changed there.
 *
 * Push first, then pull. The order is not arbitrary — pulling first means
 * accepting the other device's version of a record this device has also
 * edited but not yet sent, and the local edit is then overwritten before
 * anyone has seen it. Sending first makes the local change visible, and
 * whatever comes back is a decision made with both versions in view.
 *
 * There is no merge of *contents* anywhere here, deliberately. Two
 * devices editing the same workout is not a real scenario for a single
 * lifter with a phone and a desktop — you log sets on the phone in the
 * gym and read the results at your desk — and building three-way merge
 * for it would be a large amount of machinery guarding a case that does
 * not arise. Whole records win or lose, and the losing version is gone.
 * If that ever stops being acceptable the answer is per-field
 * timestamps, not a cleverer version of this function.
 *
 * Idempotent and safe to interrupt. A push that succeeds and a pull that
 * fails leaves the watermark unmoved, so the next run re-sends what it
 * already sent — harmless, because writes are keyed by id — rather than
 * skipping it.
 */

export interface SynchroniseDeps {
  readonly exercises: ExerciseRepository
  readonly workouts: WorkoutRepository
  readonly checkIns: CheckInRepository
  readonly items: BacklogItemRepository
  readonly projects: ProjectRepository
  readonly upgrades: UpgradeRepository
  readonly friends: FriendRepository
  readonly review: ReviewRepository
  readonly tombstones: TombstoneRepository
  readonly syncState: SyncStateRepository
  readonly settings: SettingsRepository
  readonly clock: Clock
}

export interface SyncReport {
  readonly pushed: number
  readonly received: number
  /** Received but discarded because something deleted them. */
  readonly rejected: number
  readonly at: string
}

export async function synchronise(target: SyncTarget, deps: SynchroniseDeps): Promise<SyncReport> {
  const state = (await deps.syncState.get()) ?? {}

  /*
   * Read the clock before reading the data, not after.
   *
   * Anything written *during* this exchange gets an `updatedAt` at or
   * after this instant, so it falls outside the batch being sent and is
   * caught by the next run. Stamping the watermark afterwards would place
   * it beyond records that were never included, and a set logged while
   * the sync was in flight would never be sent at all.
   */
  const startedAt = deps.clock.now().toISOString()

  const outgoing = await collectLocal(deps, state.pushedThrough, state.settingsSynced)
  await target.push(outgoing)

  const { payload: incoming, cursor } = await target.pull(state.cursor)

  const localTombstones = await deps.tombstones.all()

  /*
   * The local items go in so an incoming one can have its progress log
   * unioned with the copy already here. Only the backlog needs this — see
   * `unionProgress` for why a per-day log is the one thing in this app
   * that a record-level winner gets wrong.
   */
  const accepted = acceptableFrom(incoming, localTombstones, await deps.items.all())

  /*
   * Deletions land before records do.
   *
   * They are also recorded even when the batch is otherwise empty: a
   * tombstone this device has not stored is a deletion it will undo the
   * next time it pushes, because its own copy of the record still looks
   * like news.
   */
  if (accepted.tombstones.length > 0) {
    await deps.tombstones.record(accepted.tombstones)
    await applyDeletions(accepted.tombstones, deps)
  }

  await deps.exercises.restoreMany(accepted.exercises)
  await deps.workouts.restoreMany(accepted.workouts)
  await deps.checkIns.restoreMany(accepted.checkIns)
  await deps.items.restoreMany(accepted.items)
  await deps.projects.restoreMany(accepted.projects)
  await deps.upgrades.restoreMany(accepted.upgrades)
  await deps.friends.restoreMany(accepted.friends)
  await deps.review.restoreMetrics(accepted.metrics)
  await deps.review.restoreSnapshots(accepted.reviews)

  /*
   * Settings last, and only if they are newer.
   *
   * `mergeSettings` returns the local object by identity when the
   * incoming copy loses, so the write is skipped rather than restamping
   * values that did not change — which would make this device the newest
   * and bounce the same settings back on the next exchange, forever.
   */
  let settingsMoved = false

  if (accepted.settings !== undefined) {
    const local = await deps.settings.get()
    const merged = mergeSettings(local, accepted.settings)

    if (merged !== local) {
      await deps.settings.save(merged)
      settingsMoved = true
    }
  }

  /*
   * The stamp actually exchanged, whichever direction it went.
   *
   * Recording the incoming one matters as much as the outgoing: accepted
   * settings keep the *sending* device's stamp, and on a device whose
   * clock runs slow that value sits permanently ahead of the local
   * watermark — so a watermark comparison would re-push them on every
   * sync, forever, with nothing changing.
   */
  const settingsStamp =
    accepted.settings?.updatedAt ?? outgoing.settings?.updatedAt ?? state.settingsSynced

  await deps.syncState.save({
    cursor,
    pushedThrough: startedAt,
    ...(settingsStamp === undefined ? {} : { settingsSynced: settingsStamp }),
    lastSyncedAt: startedAt,
  })

  const received =
    accepted.exercises.length +
    accepted.workouts.length +
    accepted.checkIns.length +
    accepted.items.length +
    accepted.projects.length +
    accepted.upgrades.length +
    accepted.friends.length +
    accepted.metrics.length +
    accepted.reviews.length +
    (settingsMoved ? 1 : 0)

  const offered =
    incoming.exercises.length +
    incoming.workouts.length +
    incoming.checkIns.length +
    incoming.items.length +
    incoming.projects.length +
    incoming.upgrades.length +
    incoming.friends.length +
    incoming.metrics.length +
    incoming.reviews.length +
    (accepted.settings === undefined ? 0 : 1)

  return {
    pushed: payloadSize(outgoing),
    received,
    rejected: offered - received,
    at: startedAt,
  }
}

async function collectLocal(
  deps: SynchroniseDeps,
  watermark: string | undefined,
  settingsSynced: string | undefined,
): Promise<SyncPayload> {
  const [
    exercises,
    workouts,
    checkIns,
    items,
    projects,
    upgrades,
    friends,
    metrics,
    reviews,
    tombstones,
    settings,
  ] = await Promise.all([
    deps.exercises.all(),
    deps.workouts.all(),
    deps.checkIns.all(),
    deps.items.all(),
    deps.projects.all(),
    deps.upgrades.all(),
    deps.friends.all(),
    deps.review.metrics(),
    deps.review.snapshots(),
    deps.tombstones.all(),
    deps.settings.get(),
  ])

  /*
   * Settings travel only when they have changed since the last exchange,
   * on the same watermark as everything else.
   *
   * Unstamped settings are never sent, for the reason records are not:
   * the stamp is what makes two copies orderable, and a copy that cannot
   * prove it is newer must not overwrite one that can.
   */
  const settingsChanged = settings.updatedAt !== undefined && settings.updatedAt !== settingsSynced

  /*
   * Filtered in memory rather than by an index.
   *
   * A lifter's whole history is a few hundred records and a few megabytes
   * — reading it costs less than the round trip that follows. An index on
   * `updatedAt` is the right answer at a scale this app will not reach,
   * and adding one now would mean a migration bought with speculation.
   *
   * The exercise library is the exception worth knowing about: it is
   * *derived*, so `all()` returns the shipped catalogue as well as the
   * lifter's own. Built-ins carry no `updatedAt` and `changedSince`
   * therefore drops them — which it did not always do, and the first
   * real sync uploaded all thirty-five of them. See the note there; it is
   * the reason the rule is "no stamp, no send" rather than a watermark
   * comparison alone.
   */
  return {
    exercises: changedSince(exercises, watermark),
    workouts: changedSince(workouts, watermark),
    checkIns: changedSince(checkIns, watermark),
    items: changedSince(items, watermark),
    projects: changedSince(projects, watermark),
    upgrades: changedSince(upgrades, watermark),
    friends: changedSince(friends, watermark),
    metrics: changedSince(metrics, watermark),
    reviews: changedSince(reviews, watermark),
    tombstones: deletedSince(tombstones, watermark),
    ...(settingsChanged ? { settings: projectForSync(settings) } : {}),
  }
}

/**
 * Removes the local copies of records another device deleted.
 *
 * Recording an incoming tombstone is only half of accepting a deletion.
 * Filtering the incoming batch stops the record being *re-added*, and
 * does nothing about the copy already sitting here from an earlier
 * exchange — which is the copy that matters, because it is the one this
 * device will offer back as news on its next push. Without this the two
 * devices trade the same session forever, each politely restoring what
 * the other just deleted.
 *
 * Purged rather than removed, so no second tombstone is minted for a
 * deletion that already has one.
 *
 * A local record newer than the deletion survives, on the same rule
 * applied to incoming records: a deletion describes the record as it
 * stood, not every later version of it.
 */
async function applyDeletions(
  tombstones: readonly Tombstone[],
  deps: SynchroniseDeps,
): Promise<void> {
  for (const tombstone of tombstones) {
    switch (tombstone.collection) {
      case 'workouts': {
        const local = await deps.workouts.byId(asWorkoutId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.workouts.purge(asWorkoutId(tombstone.id))
        }
        break
      }
      case 'exercises': {
        const local = await deps.exercises.byId(asExerciseId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.exercises.purge(asExerciseId(tombstone.id))
        }
        break
      }
      case 'checkIns': {
        const local = await deps.checkIns.byId(asCheckInId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.checkIns.purge(asCheckInId(tombstone.id))
        }
        break
      }
      case 'friends': {
        const local = await deps.friends.byId(asFriendId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.friends.purge(asFriendId(tombstone.id))
        }
        break
      }
      case 'reviews': {
        const local = await deps.review.snapshot(tombstone.id)
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.review.purgeSnapshot(tombstone.id)
        }
        break
      }
      case 'upgrades': {
        const local = await deps.upgrades.byId(asUpgradeId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.upgrades.purge(asUpgradeId(tombstone.id))
        }
        break
      }
      case 'projects': {
        const local = await deps.projects.byId(asProjectId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.projects.purge(asProjectId(tombstone.id))
        }
        break
      }
      case 'items': {
        const local = await deps.items.byId(asBacklogItemId(tombstone.id))
        if (local !== undefined && !survives(local, tombstone)) {
          await deps.items.purge(asBacklogItemId(tombstone.id))
        }
        break
      }
    }
  }
}

function survives(record: { readonly updatedAt?: string }, tombstone: Tombstone): boolean {
  return record.updatedAt !== undefined && record.updatedAt > tombstone.deletedAt
}
