import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB } from 'idb'

import { createItem } from '@/domain/backlog/item'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aWorkout, BENCH, SQUAT } from '@/test/builders/workout'

import { closeAppDatabase, openDatabase, type AppDatabase } from './database'
import {
  createBacklogItemRepository,
  createExerciseRepository,
  createPositionRepository,
  createTombstoneRepository,
  createWorkoutRepository,
} from './repositories'

/** Fixed, so a stamped updatedAt is reproducible. */
const testClock = { now: () => new Date('2026-08-25T09:00:00.000Z') }

const TEST_DB = 'lift-test'

let db: AppDatabase

beforeEach(async () => {
  db = await openDatabase(TEST_DB)
})

afterEach(async () => {
  await closeAppDatabase()
  await deleteDB(TEST_DB)
})

describe('the schema', () => {
  it('creates every store the app writes to', () => {
    expect([...db.objectStoreNames].sort()).toEqual([
      'checkIns',
      'conditions',
      'dailies',
      'exercises',
      'exploredCells',
      'friends',
      'items',
      'metrics',
      'places',
      'position',
      'projects',
      'reviews',
      'tombstones',
      'trips',
      'upgrades',
      'vices',
      'weighIns',
      'workouts',
    ])
  })

  it('indexes workouts by every exercise they contain', async () => {
    // The multi-entry index is what turns "what did I do on this lift last
    // time" into a lookup. StrengthFlow answered that question by
    // downloading every workout document and scanning it — on every set.
    const workouts = createWorkoutRepository(db, testClock)

    await workouts.save(
      aWorkout({ entries: [anEntry({ exerciseId: SQUAT }), anEntry({ exerciseId: BENCH })] }),
    )
    await workouts.save(aWorkout({ entries: [anEntry({ exerciseId: SQUAT })] }))

    expect(await workouts.forExercise(SQUAT)).toHaveLength(2)
    expect(await workouts.forExercise(BENCH)).toHaveLength(1)
    expect(await workouts.forExercise(asExerciseId('never-performed'))).toHaveLength(0)
  })
})

describe('the workout repository', () => {
  it('returns recent workouts newest first', async () => {
    const workouts = createWorkoutRepository(db, testClock)

    await workouts.save(aWorkout({ date: '2026-08-01' }))
    await workouts.save(aWorkout({ date: '2026-08-20' }))
    await workouts.save(aWorkout({ date: '2026-08-10' }))

    expect((await workouts.recent(10)).map((log) => log.date)).toEqual([
      '2026-08-20',
      '2026-08-10',
      '2026-08-01',
    ])
  })

  it('stops at the requested limit rather than loading everything', async () => {
    const workouts = createWorkoutRepository(db, testClock)
    for (let day = 1; day <= 30; day += 1) {
      await workouts.save(aWorkout({ date: `2026-08-${String(day).padStart(2, '0')}` }))
    }

    const recent = await workouts.recent(5)
    expect(recent).toHaveLength(5)
    expect(recent[0]?.date).toBe('2026-08-30')
  })

  it('filters by date range', async () => {
    const workouts = createWorkoutRepository(db, testClock)

    await workouts.save(aWorkout({ date: '2026-07-15' }))
    await workouts.save(aWorkout({ date: '2026-08-05' }))
    await workouts.save(aWorkout({ date: '2026-08-25' }))

    const august = await workouts.inRange({ from: '2026-08-01', to: '2026-08-31' })
    expect(august.map((log) => log.date)).toEqual(['2026-08-25', '2026-08-05'])
  })

  it('finds the single workout still in progress', async () => {
    const workouts = createWorkoutRepository(db, testClock)

    await workouts.save(aWorkout({ status: 'completed' }))
    await workouts.save(aWorkout({ status: 'in-progress', title: 'Today' }))

    expect((await workouts.inProgress())?.title).toBe('Today')
  })

  it('returns undefined when nothing is in progress', async () => {
    const workouts = createWorkoutRepository(db, testClock)
    await workouts.save(aWorkout({ status: 'completed' }))

    expect(await workouts.inProgress()).toBeUndefined()
  })

  it('round-trips a workout without losing a field', async () => {
    const workouts = createWorkoutRepository(db, testClock)
    const original = aWorkout({
      notes: 'Felt strong',
      bodyweight: 183.5,
      entries: [anEntry({ notes: 'belt on', substitutedFor: BENCH })],
    })

    await workouts.save(original)

    const stored = await workouts.byId(original.id)

    // Structured clone rather than a JSON round-trip, so nothing is
    // silently coerced on the way in or out. `updatedAt` is added by the
    // save and is therefore the one field the input cannot carry.
    expect(stored).toEqual({ ...original, updatedAt: '2026-08-25T09:00:00.000Z' })
  })

  it('stamps when a record changed, so a merge can order two copies of it', async () => {
    const workouts = createWorkoutRepository(db, testClock)
    const original = aWorkout()

    await workouts.save(original)

    // Stamped by the repository rather than by the caller: there are
    // several paths that write a workout and a rule living in any of them
    // is a rule the next one will miss.
    expect(original.updatedAt).toBeUndefined()
    expect((await workouts.byId(original.id))?.updatedAt).toBe('2026-08-25T09:00:00.000Z')
  })

  it('records a tombstone when a workout is deleted', async () => {
    const workouts = createWorkoutRepository(db, testClock)
    const tombstones = createTombstoneRepository(db)
    const original = aWorkout()

    await workouts.save(original)
    await workouts.remove(original.id)

    expect(await workouts.byId(original.id)).toBeUndefined()
    expect(await tombstones.all()).toEqual([
      { id: original.id, collection: 'workouts', deletedAt: '2026-08-25T09:00:00.000Z' },
    ])
  })
})

describe('the exercise library', () => {
  /*
   * Derived, not stored. The catalogue is read at every use, so a change
   * to it is delivered by being made — there is no seed, no additive
   * sync and no retirement list to keep in step.
   */
  it('resolves the whole catalogue with nothing stored at all', async () => {
    const exercises = createExerciseRepository(db, testClock)

    expect(await exercises.count()).toBe(builtInExercises().length)
    expect((await exercises.byId(asExerciseId('bench-press')))?.name).toBe('Bench Press')
  })

  it('prefers the catalogue over a stale copy on the device', async () => {
    // The failure this replaces: a device went on showing 'Pull-Ups' and
    // a 12-20 lateral raise long after the catalogue said otherwise,
    // because every delivery mechanism was additive.
    const exercises = createExerciseRepository(db, testClock)
    await exercises.save(anExercise({ id: asExerciseId('bench-press'), name: 'Bench Presses' }))

    expect((await exercises.byId(asExerciseId('bench-press')))?.name).toBe('Bench Press')
  })

  it('keeps a withdrawn built-in, archived, so history still resolves', async () => {
    const exercises = createExerciseRepository(db, testClock)
    await exercises.save(
      anExercise({ id: asExerciseId('lunge'), isBuiltIn: true, isArchived: false }),
    )

    // Archived by construction rather than by a hand-written list: an
    // exercise leaving the catalogue *is* its retirement.
    expect((await exercises.byId(asExerciseId('lunge')))?.isArchived).toBe(true)
  })

  it('leaves a lifter’s own exercise alone', async () => {
    const exercises = createExerciseRepository(db, testClock)
    await exercises.save(
      anExercise({ id: asExerciseId('my-own-movement'), isBuiltIn: false, isArchived: false }),
    )

    expect((await exercises.byId(asExerciseId('my-own-movement')))?.isArchived).toBe(false)
  })
})

describe('where the lifter is', () => {
  it('stores one position and reads it back', async () => {
    // A single record under a fixed key, because there is exactly one
    // position and never a list of them. Modelling it as a collection is
    // what invited a program library in the first place.
    const position = createPositionRepository(db)

    expect(await position.get()).toBeUndefined()

    await position.save({
      cycleNumber: 2,
      blockIndex: 0,
      weekIndex: 3,
      dayIndex: 1,
      startedAt: '2026-08-01T00:00:00.000Z',
    })

    expect((await position.get())?.weekIndex).toBe(3)

    await position.save({
      cycleNumber: 2,
      blockIndex: 0,
      weekIndex: 4,
      dayIndex: 0,
      startedAt: '2026-08-01T00:00:00.000Z',
    })

    // Saved again, not appended.
    expect((await position.get())?.weekIndex).toBe(4)
  })

  it('clears back to having none', async () => {
    const position = createPositionRepository(db)
    await position.save({
      cycleNumber: 1,
      blockIndex: 0,
      weekIndex: 0,
      dayIndex: 0,
      startedAt: '2026-08-01T00:00:00.000Z',
    })

    await position.clear()

    expect(await position.get()).toBeUndefined()
  })
})

/** The first catalogue entry, as a base for building test exercises. */
function anExercise(overrides: Partial<Exercise>): Exercise {
  const [base] = builtInExercises()
  if (base === undefined) throw new Error('the built-in catalogue is empty')
  return { ...base, ...overrides }
}

describe('the backlog store', () => {
  const anItem = (title: string) =>
    createItem(
      { title, category: 'books' },
      {
        clock: { now: () => new Date('2026-08-01T09:00:00.000Z') },
        ids: { next: () => title.toLowerCase().replaceAll(' ', '-') },
      },
    )

  /*
   * The stamp is written here and nowhere else — the domain deliberately
   * leaves it undefined. If this stops holding, every sync comparison
   * involving a backlog item silently becomes "no stamp", which loses to
   * any tombstone.
   */
  it('stamps on save and not on restore', async () => {
    const items = createBacklogItemRepository(db, testClock)
    const item = anItem('Dune')

    await items.save(item)
    expect((await items.byId(item.id))?.updatedAt).toBe('2026-08-25T09:00:00.000Z')

    await items.restoreMany([{ ...item, updatedAt: '2026-01-01T00:00:00.000Z' }])
    expect((await items.byId(item.id))?.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('records a tombstone on remove and none on purge', async () => {
    const items = createBacklogItemRepository(db, testClock)
    const tombstones = createTombstoneRepository(db)

    const removed = anItem('Words of Radiance')
    const purged = anItem('Oathbringer')
    await items.save(removed)
    await items.save(purged)

    await items.remove(removed.id)
    await items.purge(purged.id)

    expect(await items.count()).toBe(0)
    expect((await tombstones.all()).map((one) => one.id)).toEqual([removed.id])
  })

  /*
   * `clear` says what it does. Backlogs had one method — `replaceAll` —
   * that wiped the collection and wrote a new one, so a caller asking to
   * fill an empty store could receive a wipe of a full one.
   */
  it('separates emptying the store from writing into it', async () => {
    const items = createBacklogItemRepository(db, testClock)

    await items.save(anItem('Dune'))
    await items.restoreMany([anItem('Elantris')])
    expect(await items.count()).toBe(2)

    await items.clear()
    expect(await items.count()).toBe(0)
  })
})
