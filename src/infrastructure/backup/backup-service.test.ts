import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { canonicalJson, checksumOf } from '@/domain/backup/checksum'
import { BACKUP_MAGIC, BACKUP_SCHEMA_VERSION } from '@/domain/backup/envelope'
import type { IdGenerator } from '@/domain/ids/ids'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import {
  clearAllStores,
  closeLiftDatabase,
  openLiftDatabase,
  type LiftDatabase,
} from '@/infrastructure/db/database'
import {
  createCheckInRepository,
  createExerciseRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { seedIfEmpty } from '@/infrastructure/seed/seed'
import { anEntry, aPostCheckIn, aWorkout, SQUAT } from '@/test/builders/workout'

import {
  applyBackup,
  backupFilename,
  buildBackup,
  parseBackup,
  previewMerge,
  serialiseBackup,
  type BackupRepositories,
} from './backup-service'

const TEST_DB = 'lift-backup-test'
const NOW = new Date('2026-08-24T12:00:00.000Z')

let db: LiftDatabase
let repositories: BackupRepositories

function counterIds(): IdGenerator {
  let n = 0
  return {
    next: () => {
      n += 1
      return `id-${String(n)}`
    },
  }
}

beforeEach(async () => {
  db = await openLiftDatabase(TEST_DB)
  repositories = {
    exercises: createExerciseRepository(db),
    workouts: createWorkoutRepository(db),
    checkIns: createCheckInRepository(db),
  }
})

afterEach(async () => {
  await closeLiftDatabase()
  await deleteDB(TEST_DB)
})

async function populate(): Promise<void> {
  await seedIfEmpty({
    exercises: repositories.exercises,
    ids: counterIds(),
    now: NOW,
  })
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

    expect(file).toContain('"magic": "lift.backup"')
    expect(file).toContain('\n  ')
    expect(file).toContain('"date": "2026-08-20"')
  })

  it('names the file by the moment it was taken', () => {
    expect(backupFilename(NOW)).toBe('lift-backup-2026-08-24-12-00-00.json')
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
    const envelope = await buildBackup(repositories, exportOptions)

    // Drop one workout locally; re-importing should add exactly that one
    // back and leave the rest as updates.
    const [first] = await repositories.workouts.recent(1)
    if (!first) throw new Error('expected a workout')
    await repositories.workouts.remove(first.id)

    const effect = await previewMerge(envelope, repositories)

    expect(effect.added.workouts).toBe(1)
    expect(effect.updated.workouts).toBe(1)
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
