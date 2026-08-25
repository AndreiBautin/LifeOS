import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB } from 'idb'

import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId, type IdGenerator } from '@/domain/ids/ids'
import {
  retireBuiltInExercises,
  seedIfEmpty,
  syncBuiltInExercises,
} from '@/infrastructure/seed/seed'
import { anEntry, aWorkout, BENCH, SQUAT } from '@/test/builders/workout'

import { closeLiftDatabase, openLiftDatabase, type LiftDatabase } from './database'
import {
  createExerciseRepository,
  createPositionRepository,
  createWorkoutRepository,
} from './repositories'

const TEST_DB = 'lift-test'

let db: LiftDatabase

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
})

afterEach(async () => {
  await closeLiftDatabase()
  await deleteDB(TEST_DB)
})

describe('the schema', () => {
  it('creates every store the app writes to', () => {
    expect([...db.objectStoreNames].sort()).toEqual([
      'checkIns',
      'exercises',
      'position',
      'workouts',
    ])
  })

  it('indexes workouts by every exercise they contain', async () => {
    // The multi-entry index is what turns "what did I do on this lift last
    // time" into a lookup. StrengthFlow answered that question by
    // downloading every workout document and scanning it — on every set.
    const workouts = createWorkoutRepository(db)

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
    const workouts = createWorkoutRepository(db)

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
    const workouts = createWorkoutRepository(db)
    for (let day = 1; day <= 30; day += 1) {
      await workouts.save(aWorkout({ date: `2026-08-${String(day).padStart(2, '0')}` }))
    }

    const recent = await workouts.recent(5)
    expect(recent).toHaveLength(5)
    expect(recent[0]?.date).toBe('2026-08-30')
  })

  it('filters by date range', async () => {
    const workouts = createWorkoutRepository(db)

    await workouts.save(aWorkout({ date: '2026-07-15' }))
    await workouts.save(aWorkout({ date: '2026-08-05' }))
    await workouts.save(aWorkout({ date: '2026-08-25' }))

    const august = await workouts.inRange({ from: '2026-08-01', to: '2026-08-31' })
    expect(august.map((log) => log.date)).toEqual(['2026-08-25', '2026-08-05'])
  })

  it('finds the single workout still in progress', async () => {
    const workouts = createWorkoutRepository(db)

    await workouts.save(aWorkout({ status: 'completed' }))
    await workouts.save(aWorkout({ status: 'in-progress', title: 'Today' }))

    expect((await workouts.inProgress())?.title).toBe('Today')
  })

  it('returns undefined when nothing is in progress', async () => {
    const workouts = createWorkoutRepository(db)
    await workouts.save(aWorkout({ status: 'completed' }))

    expect(await workouts.inProgress()).toBeUndefined()
  })

  it('round-trips a workout without losing a field', async () => {
    const workouts = createWorkoutRepository(db)
    const original = aWorkout({
      notes: 'Felt strong',
      bodyweight: 183.5,
      entries: [anEntry({ notes: 'belt on', substitutedFor: BENCH })],
    })

    await workouts.save(original)

    // Structured clone rather than a JSON round-trip, so nothing is
    // silently coerced on the way in or out.
    expect(await workouts.byId(original.id)).toEqual(original)
  })
})

describe('seeding the exercise library', () => {
  const deps = () => ({
    exercises: createExerciseRepository(db),
    ids: counterIds(),
    now: new Date('2026-08-24T00:00:00Z'),
  })

  it('fills an empty library with the built-in catalogue', async () => {
    expect(await seedIfEmpty(deps())).toBe(builtInExercises().length)
  })

  it('cannot overwrite anything, however many times it runs', async () => {
    // The property that matters most in the whole persistence layer. A
    // seed that can overwrite is one wrong call away from deleting a
    // lifter's training history.
    const exercises = createExerciseRepository(db)

    await seedIfEmpty(deps())
    await exercises.save(
      anExercise({
        id: asExerciseId('bench-press'),
        name: 'Bench Press (my cue: elbows tucked)',
        isBuiltIn: false,
      }),
    )

    await seedIfEmpty(deps())
    await seedIfEmpty(deps())

    expect((await exercises.byId(asExerciseId('bench-press')))?.name).toBe(
      'Bench Press (my cue: elbows tucked)',
    )
  })

  it('reports adding nothing on a second run', async () => {
    await seedIfEmpty(deps())
    expect(await seedIfEmpty(deps())).toBe(0)
  })

  it('adds exercises an older install never received', async () => {
    const exercises = createExerciseRepository(db)
    await exercises.saveMany(builtInExercises().slice(0, 5))

    expect(await syncBuiltInExercises(deps())).toBe(builtInExercises().length - 5)
  })

  it('archives an exercise withdrawn from the catalogue', async () => {
    const exercises = createExerciseRepository(db)
    await seedIfEmpty(deps())
    await exercises.save(anExercise({ id: asExerciseId('lunge'), isArchived: false }))

    expect(await retireBuiltInExercises(deps(), ['lunge'])).toEqual(['lunge'])
    // Archived, not deleted: workouts already logged still refer to it.
    expect((await exercises.byId(asExerciseId('lunge')))?.isArchived).toBe(true)
  })

  it('never archives an exercise that is not on the retired list', async () => {
    // An  carries no origin, so "anything the catalogue no
    // longer contains" would archive the lifter's entire custom library.
    const exercises = createExerciseRepository(db)
    await exercises.save(anExercise({ id: asExerciseId('my-own-movement'), isArchived: false }))

    await retireBuiltInExercises(deps(), ['lunge'])

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
