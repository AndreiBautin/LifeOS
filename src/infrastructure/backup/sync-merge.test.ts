import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { closeAppDatabase, openDatabase, type AppDatabase } from '@/infrastructure/db/database'
import {
  createCheckInRepository,
  createAttemptRepository,
  createChallengeRepository,
  createRoomRepository,
  createCampaignRepository,
  createResumeRepository,
  createBacklogItemRepository,
  createExploredAreaRepository,
  createPlaceRepository,
  createProjectRepository,
  createReviewRepository,
  createTombstoneRepository,
  createTripRepository,
  createViceRepository,
  createFinanceRepository,
  createUpgradeRepository,
  createExerciseRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { aWorkout } from '@/test/builders/workout'

import { buildBackup, type BackupRepositories } from './backup-service'
import { COLLECTIONS, COLLECTION_KEYS } from './collections'
import { mergeNewer, recordsFingerprint } from './sync-merge'

/** Fixed, so a stamped updatedAt is reproducible. */
const testClock = { now: () => new Date('2026-08-25T09:00:00.000Z') }

const TEST_DB = 'lifeos-sync-merge-test'
const NOW = new Date('2026-08-24T12:00:00.000Z')

let db: AppDatabase
let repositories: BackupRepositories

beforeEach(async () => {
  db = await openDatabase(TEST_DB)
  repositories = {
    exercises: createExerciseRepository(db, testClock),
    workouts: createWorkoutRepository(db, testClock),
    checkIns: createCheckInRepository(db, testClock),
    resume: createResumeRepository(db, testClock),
    campaigns: createCampaignRepository(db, testClock),
    attempts: createAttemptRepository(db, testClock),
    challenges: createChallengeRepository(db, testClock),
    rooms: createRoomRepository(db, testClock),
    tombstones: createTombstoneRepository(db),
    items: createBacklogItemRepository(db, testClock),
    projects: createProjectRepository(db, testClock),
    upgrades: createUpgradeRepository(db, testClock),
    review: createReviewRepository(db, testClock),
    places: createPlaceRepository(db, testClock),
    trips: createTripRepository(db, testClock),
    explored: createExploredAreaRepository(db),
    vices: createViceRepository(db, testClock),
    finance: createFinanceRepository(db, testClock),
  }
})

afterEach(async () => {
  await closeAppDatabase()
  await deleteDB(TEST_DB)
})

const exportOptions = { settings: DEFAULT_SETTINGS, appVersion: '1.0.0', now: NOW }

/** The other device's copy: this device's backup with its records swapped out. */
async function otherDevice(
  change: (
    data: Awaited<ReturnType<typeof buildBackup>>['data'],
  ) => Partial<Awaited<ReturnType<typeof buildBackup>>['data']>,
) {
  const mine = await buildBackup(repositories, exportOptions)
  return { ...mine, data: { ...mine.data, ...change(mine.data) } }
}

const EARLY = '2026-08-20T08:00:00.000Z'
const LATE = '2026-08-22T08:00:00.000Z'

/**
 * Sync between two devices taking turns.
 *
 * The property that matters is the one the file import deliberately does
 * not have: neither side's edits are thrown away by the other's copy.
 */
describe('merging the other device for sync', () => {
  it('takes the other device’s edit when it is newer', async () => {
    const workout = aWorkout({ notes: 'mine', updatedAt: EARLY })
    await repositories.workouts.restoreMany([workout])

    const remote = await otherDevice(() => ({
      workouts: [{ ...workout, notes: 'theirs', updatedAt: LATE }],
    }))
    const result = await mergeNewer(remote, repositories)

    expect(result.pulled).toBe(1)
    expect((await repositories.workouts.byId(workout.id))?.notes).toBe('theirs')
  })

  it('keeps this device’s edit when the other copy is older', async () => {
    const workout = aWorkout({ notes: 'mine', updatedAt: LATE })
    await repositories.workouts.restoreMany([workout])

    const remote = await otherDevice(() => ({
      workouts: [{ ...workout, notes: 'theirs', updatedAt: EARLY }],
    }))
    await mergeNewer(remote, repositories)

    expect((await repositories.workouts.byId(workout.id))?.notes).toBe('mine')
  })

  it('keeps a record only this device has, and adds one only the other has', async () => {
    const mine = aWorkout({ notes: 'only here', updatedAt: EARLY })
    await repositories.workouts.restoreMany([mine])
    const theirs = aWorkout({ notes: 'only there', updatedAt: LATE })

    const remote = await otherDevice(() => ({ workouts: [theirs] }))
    await mergeNewer(remote, repositories)

    const ids = (await repositories.workouts.all()).map((one) => one.id)
    expect(ids).toContain(mine.id)
    expect(ids).toContain(theirs.id)
  })

  /*
   * Without the purge a record deleted on the phone would survive on the
   * desktop, and the desktop's next upload would put it straight back.
   */
  it('removes a record here that the other device deleted', async () => {
    const workout = aWorkout({ updatedAt: EARLY })
    await repositories.workouts.restoreMany([workout])

    const remote = await otherDevice(() => ({
      workouts: [],
      tombstones: [{ id: workout.id, collection: 'workouts', deletedAt: LATE }],
    }))
    const result = await mergeNewer(remote, repositories)

    expect(result.purged).toBe(1)
    expect(await repositories.workouts.byId(workout.id)).toBeUndefined()
  })

  it('keeps a record edited here after the other device deleted it', async () => {
    const workout = aWorkout({ updatedAt: LATE })
    await repositories.workouts.restoreMany([workout])

    const remote = await otherDevice(() => ({
      workouts: [],
      tombstones: [{ id: workout.id, collection: 'workouts', deletedAt: EARLY }],
    }))
    await mergeNewer(remote, repositories)

    expect(await repositories.workouts.byId(workout.id)).toBeDefined()
  })
})

/**
 * Two identical copies must fingerprint identically, or two devices would
 * each upload a no-op commit on every sync, forever.
 */
describe('the records fingerprint', () => {
  it('ignores the order records come back in and the settings', async () => {
    const a = aWorkout({ updatedAt: EARLY })
    const b = aWorkout({ updatedAt: LATE })
    await repositories.workouts.restoreMany([a, b])
    const backup = await buildBackup(repositories, exportOptions)

    const shuffled = {
      ...backup.data,
      workouts: [...backup.data.workouts].reverse(),
      settings: { ...backup.data.settings, bodyweight: 999 },
    }

    expect(recordsFingerprint(shuffled)).toBe(recordsFingerprint(backup.data))
  })

  it('changes when a record does', async () => {
    const workout = aWorkout({ updatedAt: EARLY })
    await repositories.workouts.restoreMany([workout])
    const backup = await buildBackup(repositories, exportOptions)

    const edited = {
      ...backup.data,
      workouts: [{ ...workout, notes: 'changed', updatedAt: LATE }],
    }

    expect(recordsFingerprint(edited)).not.toBe(recordsFingerprint(backup.data))
  })
})

/*
 * A collection that can be deleted from but has no purge would accept the
 * other device's tombstone and keep the record anyway — deleted on the
 * phone, alive on the desktop, and pushed back up on the next round.
 * Nothing else would notice.
 */
describe('the collection table', () => {
  it('can purge from every collection a tombstone can name', () => {
    for (const key of COLLECTION_KEYS) {
      const collection = COLLECTIONS[key]
      expect(collection.purge !== undefined, key).toBe(collection.tombstoneCollection !== undefined)
    }
  })
})
