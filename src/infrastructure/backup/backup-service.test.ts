import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { canonicalJson, checksumOf } from '@/domain/backup/checksum'
import { BACKUP_MAGIC, BACKUP_SCHEMA_VERSION } from '@/domain/backup/envelope'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import {
  clearAllStores,
  closeAppDatabase,
  openDatabase,
  type AppDatabase,
} from '@/infrastructure/db/database'
import {
  createCheckInRepository,
  createAttemptRepository,
  createCampaignRepository,
  createResumeRepository,
  createBacklogItemRepository,
  createDailyRepository,
  createExploredAreaRepository,
  createFriendRepository,
  createPlaceRepository,
  createProjectRepository,
  createReviewRepository,
  createTombstoneRepository,
  createTripRepository,
  createViceRepository,
  createFinanceRepository,
  createWeighInRepository,
  createUpgradeRepository,
  createExerciseRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { anEntry, aPostCheckIn, aWorkout, SQUAT } from '@/test/builders/workout'
import { createItem } from '@/domain/backlog/item'
import { asFriendId } from '@/domain/ids/ids'
import { countsFor } from '@/domain/backup/envelope'

const anItemDeps = {
  clock: { now: () => new Date('2026-08-24T12:00:00.000Z') },
  ids: { next: () => 'item-1' },
}

import {
  applyBackup,
  backupFilename,
  buildBackup,
  parseBackup,
  previewMerge,
  serialiseBackup,
  type BackupRepositories,
} from './backup-service'

/** Fixed, so a stamped updatedAt is reproducible. */
const testClock = { now: () => new Date('2026-08-25T09:00:00.000Z') }

const TEST_DB = 'lifeos-backup-test'
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
    tombstones: createTombstoneRepository(db),
    items: createBacklogItemRepository(db, testClock),
    projects: createProjectRepository(db, testClock),
    upgrades: createUpgradeRepository(db, testClock),
    friends: createFriendRepository(db, testClock),
    review: createReviewRepository(db, testClock),
    places: createPlaceRepository(db, testClock),
    trips: createTripRepository(db, testClock),
    explored: createExploredAreaRepository(db),
    dailies: createDailyRepository(db, testClock),
    vices: createViceRepository(db, testClock),
    weighIns: createWeighInRepository(db, testClock),
    finance: createFinanceRepository(db, testClock),
  }
})

afterEach(async () => {
  await closeAppDatabase()
  await deleteDB(TEST_DB)
})

async function populate(): Promise<void> {
  await repositories.workouts.save(
    aWorkout({ date: '2026-08-01', entries: [anEntry({ exerciseId: SQUAT })] }),
  )
  await repositories.workouts.save(aWorkout({ date: '2026-08-20', notes: 'PR day' }))
  await repositories.checkIns.save(aPostCheckIn({ quads: 'hard' }))
}

const exportOptions = { settings: DEFAULT_SETTINGS, appVersion: '1.0.0', now: NOW }

describe('export and import round-trip', () => {
  it('restores byte-identical data into an emptied database', async () => {
    // The property the whole local-only architecture rests on. If this
    // does not hold, a lifter moving to a new phone loses everything, and
    // there is no server to fall back to.
    await populate()

    const original = await buildBackup(repositories, exportOptions)
    const file = serialiseBackup(original)

    await clearAllStores(db)
    expect(await repositories.workouts.count()).toBe(0)

    const { preview, envelope } = parseBackup(file)
    expect(preview.valid).toBe(true)
    if (!envelope) throw new Error('expected a valid envelope')

    await applyBackup(envelope, repositories, 'replace')

    const restored = await buildBackup(repositories, exportOptions)
    expect(canonicalJson(restored.data)).toBe(canonicalJson(original.data))
  })

  it('survives a second round-trip unchanged', async () => {
    await populate()

    const first = serialiseBackup(await buildBackup(repositories, exportOptions))
    await clearAllStores(db)

    const parsedFirst = parseBackup(first)
    if (!parsedFirst.envelope) throw new Error('expected a valid envelope')
    await applyBackup(parsedFirst.envelope, repositories, 'replace')

    const second = serialiseBackup(await buildBackup(repositories, exportOptions))
    expect(second).toBe(first)
  })

  it('writes a file a human can read', async () => {
    await populate()
    const file = serialiseBackup(await buildBackup(repositories, exportOptions))

    expect(file).toContain('"magic": "lifeos.backup"')
    expect(file).toContain('\n  ')
    expect(file).toContain('"date": "2026-08-20"')
  })

  it('names the file by the moment it was taken', () => {
    expect(backupFilename(NOW)).toBe('lifeos-backup-2026-08-24-12-00-00.json')
  })
})

describe('rejecting a file that would corrupt the database', () => {
  it('refuses a truncated backup', async () => {
    // The realistic failure: an interrupted download or a disk that filled
    // mid-write. Such a file can still parse as JSON up to the cut, and
    // importing it would restore a partial history that looks complete.
    await populate()
    const file = serialiseBackup(await buildBackup(repositories, exportOptions))

    const truncated = JSON.parse(file) as { data: { workouts: unknown[] } }
    truncated.data.workouts = truncated.data.workouts.slice(0, 1)

    const { preview, envelope } = parseBackup(JSON.stringify(truncated))

    expect(preview.valid).toBe(false)
    expect(envelope).toBeUndefined()
    expect(preview.problems.some((problem) => problem.message.includes('integrity check'))).toBe(
      true,
    )
  })

  it('refuses a file that is not a backup', () => {
    const { preview } = parseBackup(JSON.stringify({ some: 'other json' }))

    expect(preview.valid).toBe(false)
    expect(preview.problems[0]?.message).toMatch(/does not look like a Lift backup/)
  })

  it('refuses text that is not JSON at all', () => {
    expect(parseBackup('not json {{{').preview.valid).toBe(false)
  })

  it('refuses a backup from a newer version rather than guessing', () => {
    const future = {
      magic: BACKUP_MAGIC,
      schemaVersion: BACKUP_SCHEMA_VERSION + 5,
      data: {},
    }

    const { preview } = parseBackup(JSON.stringify(future))

    expect(preview.valid).toBe(false)
    expect(preview.problems[0]?.message).toMatch(/newer version of Lift/)
  })

  it('refuses a backup missing a whole section', () => {
    const broken = {
      magic: BACKUP_MAGIC,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      checksum: '',
      data: { settings: DEFAULT_SETTINGS, exercises: [], programs: [], instances: [] },
    }

    const { preview } = parseBackup(JSON.stringify(broken))

    expect(preview.valid).toBe(false)
    expect(preview.problems.some((problem) => problem.message.includes('workouts'))).toBe(true)
  })
})

describe('the preview shown before importing', () => {
  it('reports what the file holds and the span it covers', async () => {
    await populate()
    const file = serialiseBackup(await buildBackup(repositories, exportOptions))

    const { preview } = parseBackup(file)

    expect(preview.counts?.workouts).toBe(2)
    expect(preview.dateRange).toEqual({ from: '2026-08-01', to: '2026-08-20' })
    expect(preview.exportedAt).toBe(NOW.toISOString())
  })

  it('distinguishes records that would be added from those overwritten', async () => {
    await populate()

    // Recorded before the export, so the file carries it and the local
    // database does not — an addition with no deletion involved.
    const extra = aWorkout({ date: '2026-08-20', title: 'Only in the file' })
    await repositories.workouts.save(extra)

    const envelope = await buildBackup(repositories, exportOptions)
    await repositories.workouts.restoreMany([])

    const effect = await previewMerge(envelope, repositories)

    expect(effect.updated.workouts).toBe(3)
    expect(effect.added.workouts).toBe(0)
  })

  /*
   * This case used to assert the opposite, in as many words: "re-importing
   * should add exactly that one back". It described what the code did
   * rather than what anyone wanted, and what the code did was undo
   * deletions — silently, and reported as an *addition*, which is the
   * word a merge uses for a record it is restoring.
   */
  it('does not restore a session that was deleted after the backup was written', async () => {
    await populate()
    const envelope = await buildBackup(repositories, exportOptions)

    const [first] = await repositories.workouts.recent(1)
    if (!first) throw new Error('expected a workout')
    await repositories.workouts.remove(first.id)

    const effect = await previewMerge(envelope, repositories)
    expect(effect.added.workouts).toBe(0)

    await applyBackup(envelope, repositories, 'merge')

    expect(await repositories.workouts.byId(first.id)).toBeUndefined()
  })
})

describe('merge versus replace', () => {
  it('keeps local records a merge does not mention', async () => {
    await populate()
    const envelope = await buildBackup(repositories, exportOptions)

    await repositories.workouts.save(aWorkout({ date: '2026-09-01', title: 'Logged later' }))
    await applyBackup(envelope, repositories, 'merge')

    const dates = (await repositories.workouts.recent(10)).map((log) => log.date)
    expect(dates).toContain('2026-09-01')
  })

  it('does not adopt the file’s settings on a merge', async () => {
    // Merging someone else's training maxes into a live setup would
    // silently rewrite every percentage the program prescribes.
    await populate()
    const envelope = await buildBackup(repositories, {
      ...exportOptions,
      settings: { ...DEFAULT_SETTINGS, bodyweight: 205 },
    })

    const merged = await applyBackup(envelope, repositories, 'merge')
    expect(merged.settings).toBeUndefined()

    const replaced = await applyBackup(envelope, repositories, 'replace')
    expect(replaced.settings?.bodyweight).toBe(205)
  })
})

describe('the checksum', () => {
  it('is stable regardless of key order', () => {
    expect(checksumOf({ a: 1, b: 2 })).toBe(checksumOf({ b: 2, a: 1 }))
  })

  it('changes when a single number changes', () => {
    expect(checksumOf({ load: 225 })).not.toBe(checksumOf({ load: 230 }))
  })

  it('changes when a record is dropped', () => {
    expect(checksumOf({ items: [1, 2, 3] })).not.toBe(checksumOf({ items: [1, 2] }))
  })

  it('distinguishes an empty array from an absent field', () => {
    expect(checksumOf({ items: [] })).not.toBe(checksumOf({}))
  })
})

/**
 * The absorbed areas, which for five versions of this file were not in it.
 *
 * The envelope's own contract is that a restore from one file reproduces
 * the app exactly, and the moment this hub gained a backlog, a quest log,
 * a tech tree, a circle, a review and an atlas, that stopped being true —
 * five areas of records outside the only export the app has, on a device
 * whose storage a browser can clear without asking. A partial backup is
 * worse than none, because it is trusted.
 */
async function populateEverything(): Promise<void> {
  await populate()

  await repositories.items.save(createItem({ title: 'Dune', category: 'books' }, anItemDeps))
  await repositories.friends.save({
    id: asFriendId('friend-1'),
    name: 'Sam',
    cadenceDays: 30,
    lastHangout: '2026-08-01',
    createdAt: '2026-01-01T00:00:00.000Z',
  } as never)
  await repositories.places.save({
    id: 'place-1',
    name: 'Kiln',
    categoryId: 'food',
    status: 'wantToVisit',
    location: { coordinates: { latitude: 51.5, longitude: -0.1 } },
    favorite: false,
    tags: [],
    dateAdded: '2026-08-01T00:00:00.000Z',
  } as never)
  await repositories.trips.save({
    id: 'trip-1',
    name: 'Lisbon',
    location: 'Portugal',
    placeIds: [],
  } as never)
  await repositories.explored.reveal(['gcpvj0u' as never, 'gcpvj0v' as never])
}

describe('everything the hub holds, not only the training half', () => {
  it('carries every collection through a round trip', async () => {
    await populateEverything()

    const file = serialiseBackup(await buildBackup(repositories, exportOptions))
    await clearAllStores(db)
    const parsed = parseBackup(file)
    if (parsed.envelope === undefined) throw new Error('the file did not parse')
    await applyBackup(parsed.envelope, repositories, 'replace')

    expect(await repositories.items.all()).toHaveLength(1)
    expect(await repositories.friends.all()).toHaveLength(1)
    expect(await repositories.places.all()).toHaveLength(1)
    expect(await repositories.trips.all()).toHaveLength(1)
    expect((await repositories.explored.all()).size).toBe(2)
  })

  it('counts what it carried, so the number on the button is true', async () => {
    await populateEverything()

    const envelope = await buildBackup(repositories, exportOptions)

    expect(envelope.counts).toMatchObject({
      items: 1,
      friends: 1,
      places: 1,
      trips: 1,
      exploredCells: 2,
    })
  })

  /*
   * Walked ground merges by union and never by replacement — there is no
   * such thing as un-walking it, which is why it has no tombstone anywhere
   * else in the hub either. An import that replaced the set would erase a
   * morning the other device walked.
   */
  it('adds walked ground rather than replacing it', async () => {
    await repositories.explored.reveal(['gcpvj0u' as never])
    const file = serialiseBackup(await buildBackup(repositories, exportOptions))

    await repositories.explored.clear()
    await repositories.explored.reveal(['gcpuvxx' as never])

    const parsed = parseBackup(file)
    if (parsed.envelope === undefined) throw new Error('the file did not parse')
    await applyBackup(parsed.envelope, repositories, 'merge')

    expect((await repositories.explored.all()).size).toBe(2)
  })

  /*
   * The concession every added section makes: an older file simply has no
   * such section, and a missing one means "none" rather than "delete what
   * is here". A version 2 file has to keep importing, or every backup
   * taken before today becomes unreadable.
   */
  it('accepts a file written before these sections existed', async () => {
    await populateEverything()
    const envelope = await buildBackup(repositories, exportOptions)

    const older = {
      ...envelope,
      schemaVersion: 2,
      data: {
        settings: envelope.data.settings,
        exercises: envelope.data.exercises,
        workouts: envelope.data.workouts,
        checkIns: envelope.data.checkIns,
        tombstones: envelope.data.tombstones,
      },
    }
    const legacy = serialiseBackup({
      ...older,
      checksum: checksumOf(older.data),
      counts: countsFor(older.data as never),
    } as never)

    const parsed = parseBackup(legacy)

    expect(parsed.preview.problems.filter((one) => one.severity === 'error')).toHaveLength(0)
    expect(parsed.envelope).toBeDefined()
  })
})

/*
 * The resume was in no list anywhere — not this envelope, not the sync
 * payload — so the one record a person types in by hand, off a PDF,
 * survived on a single device with no copy while both the export and
 * the sync reported success. Every other record here is a by-product of
 * using the app and can be regenerated by using it again.
 */
describe('the resume in a backup', () => {
  it('carries the resume out and back', async () => {
    await repositories.resume.save({
      name: 'Typed once',
      contact: '',
      summary: 'Senior engineer',
      skills: [],
      companies: [],
      education: [],
    })

    const file = serialiseBackup(await buildBackup(repositories, exportOptions))

    await clearAllStores(db)
    expect(await repositories.resume.get()).toBeUndefined()

    const { envelope } = parseBackup(file)
    if (!envelope) throw new Error('expected a valid envelope')
    await applyBackup(envelope, repositories, 'replace')

    expect((await repositories.resume.get())?.name).toBe('Typed once')
  })

  it('counts it, so the preview cannot say a backup is complete while omitting it', async () => {
    await repositories.resume.save({
      name: 'Typed once',
      contact: '',
      summary: '',
      skills: [],
      companies: [],
      education: [],
    })

    expect((await buildBackup(repositories, exportOptions)).counts.resume).toBe(1)
  })

  it('is absent rather than empty when there is no resume', async () => {
    // Nought or one. A device where nobody has typed one exports no
    // resume rather than a blank one that would overwrite a real one on
    // the way back in.
    const backup = await buildBackup(repositories, exportOptions)

    expect(backup.counts.resume).toBe(0)
    expect(backup.data.resume ?? []).toEqual([])
  })
})
