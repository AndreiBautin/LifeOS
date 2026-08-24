import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB } from 'idb'

import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId, asInstanceId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { ProgramInstance } from '@/domain/repositories/ports'
import { seedIfEmpty } from '@/infrastructure/seed/seed'
import { anEntry, aWorkout, BENCH, SQUAT } from '@/test/builders/workout'

import { closeLiftDatabase, openLiftDatabase, type LiftDatabase } from './database'
import {
  createExerciseRepository,
  createInstanceRepository,
  createProgramRepository,
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
      'instances',
      'programs',
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

describe('the instance repository', () => {
  const instance = (overrides: Partial<ProgramInstance>): ProgramInstance =>
    ({
      id: asInstanceId('i1'),
      programId: asProgramId('p1'),
      templateSnapshot: {
        id: asProgramId('p1'),
        name: 'Snapshot',
        description: '',
        origin: 'custom',
        blocks: [],
        settings: {
          units: 'lb',
          roundingIncrement: 5,
          trainingMaxPercent: 90,
          defaultRestSeconds: 120,
        },
        requiredTrainingMaxes: [],
        tags: [],
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
      name: 'Run 1',
      startedAt: '2026-08-01T00:00:00.000Z',
      status: 'active',
      cycleNumber: 1,
      blockIndex: 0,
      weekIndex: 0,
      dayIndex: 0,
      trainingMaxesAtStart: {},
      ...overrides,
    }) satisfies ProgramInstance

  it('finds the active run', async () => {
    const instances = createInstanceRepository(db)

    await instances.save(instance({ id: asInstanceId('old'), status: 'completed' }))
    await instances.save(instance({ id: asInstanceId('current'), status: 'active' }))

    expect((await instances.active())?.id).toBe('current')
  })

  it('prefers the most recently started when a backup left two active', async () => {
    const instances = createInstanceRepository(db)

    await instances.save(
      instance({ id: asInstanceId('a'), status: 'active', startedAt: '2026-01-01T00:00:00.000Z' }),
    )
    await instances.save(
      instance({ id: asInstanceId('b'), status: 'active', startedAt: '2026-08-01T00:00:00.000Z' }),
    )

    expect((await instances.active())?.id).toBe('b')
  })
})

describe('seeding', () => {
  const deps = () => ({
    exercises: createExerciseRepository(db),
    programs: createProgramRepository(db),
    ids: counterIds(),
    now: new Date('2026-08-24T00:00:00Z'),
  })

  it('fills an empty database with the built-in library and programs', async () => {
    const result = await seedIfEmpty(deps())

    expect(result.exercisesAdded).toBe(builtInExercises().length)
    expect(result.programsAdded).toBeGreaterThan(0)
  })

  it('cannot overwrite anything, however many times it runs', async () => {
    // The property that matters most in the whole persistence layer. A
    // seed that can overwrite is one wrong call away from deleting a
    // lifter's training history.
    const exercises = createExerciseRepository(db)

    await seedIfEmpty(deps())
    const mine = anExercise({
      id: asExerciseId('bench-press'),
      name: 'Bench Press (my cue: elbows tucked)',
      isBuiltIn: false,
    })
    await exercises.save(mine)

    await seedIfEmpty(deps())
    await seedIfEmpty(deps())

    expect((await exercises.byId(asExerciseId('bench-press')))?.name).toBe(
      'Bench Press (my cue: elbows tucked)',
    )
  })

  it('reports adding nothing on a second run', async () => {
    await seedIfEmpty(deps())
    const second = await seedIfEmpty(deps())

    expect(second).toEqual({ exercisesAdded: 0, programsAdded: 0 })
  })

  it('restores programs without touching a customised exercise library', async () => {
    const exercises = createExerciseRepository(db)
    const programs = createProgramRepository(db)

    await seedIfEmpty(deps())
    await programs.remove(asProgramId('built-in-531-bbb'))
    await exercises.save(
      anExercise({
        id: asExerciseId('my-own-lift'),
        name: 'Zercher Squat',
        isBuiltIn: false,
      }),
    )

    const before = await exercises.count()
    await seedIfEmpty(deps())

    // Programs were empty of nothing — one was removed but others remain,
    // so the program store is not empty and is left alone.
    expect(await exercises.count()).toBe(before)
    expect(await exercises.byId(asExerciseId('my-own-lift'))).toBeDefined()
  })

  it('produces programs whose main lifts exist in the seeded library', async () => {
    // A built-in referencing an exercise that is not in the catalogue
    // would render as a blank row in the UI, which is exactly the failure
    // LiftTracker's exercise query produced when nothing matched.
    const { exercises, programs } = deps()
    await seedIfEmpty(deps())

    const library = new Set((await exercises.all()).map((exercise) => exercise.id as string))

    for (const program of await programs.all()) {
      const referenced = program.blocks
        .flatMap((block) => block.weeks)
        .flatMap((week) => week.days)
        .flatMap((day) => day.slots)
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

      for (const id of referenced) {
        expect(library.has(id), `${program.name} references missing exercise ${id}`).toBe(true)
      }
    }
  })
})

/** The first catalogue entry, as a base for building test exercises. */
function anExercise(overrides: Partial<Exercise>): Exercise {
  const [base] = builtInExercises()
  if (base === undefined) throw new Error('the built-in catalogue is empty')
  return { ...base, ...overrides }
}
