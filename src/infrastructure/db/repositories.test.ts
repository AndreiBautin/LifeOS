import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteDB } from 'idb'

import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId, asInstanceId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { ProgramTemplate } from '@/domain/programs/program'
import type { ProgramInstance } from '@/domain/repositories/ports'
import { STORAGE_KEYS } from '@/config/storage-keys'
import { BUILT_IN_PROGRAM_COUNT, builtInPrograms } from '@/infrastructure/seed/built-in-programs'
import {
  retireBuiltInPrograms,
  seedIfEmpty,
  syncBuiltInExercises,
  syncBuiltInPrograms,
} from '@/infrastructure/seed/seed'
import {
  readDeliveredBuiltIns,
  recordDeliveredBuiltIns,
} from '@/infrastructure/storage/built-in-delivery'
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
          defaultRestSeconds: 120,
        },
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

/** A minimal template, for tests about storage rather than about content. */
function aProgram(): ProgramTemplate {
  return {
    id: asProgramId('p-test'),
    name: 'Test program',
    description: '',
    origin: 'custom',
    blocks: [],
    settings: { units: 'lb', roundingIncrement: 5, defaultRestSeconds: 120 },
    tags: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

describe('keeping the built-in library current', () => {
  const deps = () => ({
    exercises: createExerciseRepository(db),
    programs: createProgramRepository(db),
    ids: counterIds(),
    now: new Date('2026-08-24T00:00:00Z'),
  })

  it('adds exercises an older install never received', async () => {
    const exercises = createExerciseRepository(db)

    // An install created before half the catalogue shipped.
    const partial = builtInExercises().slice(0, 5)
    await exercises.saveMany(partial)
    expect(await exercises.count()).toBe(5)

    const added = await syncBuiltInExercises(deps())

    expect(added).toBe(builtInExercises().length - 5)
    expect(await exercises.count()).toBe(builtInExercises().length)
  })

  it('leaves an edited built-in alone', async () => {
    // Additive only. The lifter's version of an exercise they have
    // customised must survive an app update that touches the catalogue.
    const exercises = createExerciseRepository(db)
    await seedIfEmpty(deps())

    await exercises.save(anExercise({ id: asExerciseId('bench-press'), name: 'My Bench Cue' }))
    await syncBuiltInExercises(deps())

    expect((await exercises.byId(asExerciseId('bench-press')))?.name).toBe('My Bench Cue')
  })

  it('adds nothing when the library is already current', async () => {
    await seedIfEmpty(deps())
    expect(await syncBuiltInExercises(deps())).toBe(0)
  })

  it('adds programs an older install never received', async () => {
    // The upgrade path that was broken: `seedIfEmpty` skips a non-empty
    // program store entirely, so an install holding the older built-ins
    // would never have seen the RP blocks.
    const programs = createProgramRepository(db)
    const all = builtInPrograms(counterIds(), new Date('2026-08-24T00:00:00Z'))
    const older = all.filter((program) => !(program.id as string).startsWith('built-in-rp'))
    for (const program of older) await programs.save(program)

    const result = await syncBuiltInPrograms(deps(), new Set())

    expect(result.added).toEqual(['built-in-rp-block', 'built-in-rp-block-6day'])
    expect(await programs.count()).toBe(all.length)
  })

  it('does not resurrect a built-in program the lifter deleted', async () => {
    // "Missing" and "deleted" look identical in the database, so delivery
    // is recorded separately. Getting this wrong would put a deleted
    // program back on every single app start.
    const programs = createProgramRepository(db)
    await seedIfEmpty(deps())

    const delivered = new Set(
      builtInPrograms(counterIds(), new Date('2026-08-24T00:00:00Z')).map(
        (program) => program.id as string,
      ),
    )

    await programs.remove(asProgramId('built-in-rp-block'))
    const result = await syncBuiltInPrograms(deps(), delivered)

    expect(result.added).toEqual([])
    expect(await programs.byId(asProgramId('built-in-rp-block'))).toBeUndefined()
  })

  it('leaves an edited built-in program alone', async () => {
    const programs = createProgramRepository(db)
    await seedIfEmpty(deps())

    const original = await programs.byId(asProgramId('built-in-rp-block'))
    if (original === undefined) throw new Error('expected the built-in block to be seeded')
    await programs.save({ ...original, name: 'My Block' })

    await syncBuiltInPrograms(deps(), new Set())

    expect((await programs.byId(asProgramId('built-in-rp-block')))?.name).toBe('My Block')
  })

  it('removes a built-in the app no longer ships', async () => {
    const programs = createProgramRepository(db)
    await seedIfEmpty(deps())
    await programs.save({
      ...aProgram(),
      id: asProgramId('built-in-531-bbb'),
      origin: 'built-in',
    })

    const removed = await retireBuiltInPrograms(
      { ...deps(), instances: createInstanceRepository(db) },
      ['built-in-531-bbb'],
    )

    expect(removed).toEqual(['built-in-531-bbb'])
    expect(await programs.byId(asProgramId('built-in-531-bbb'))).toBeUndefined()
  })

  it('never retires a program the lifter made their own', async () => {
    // Retirement withdraws the app's own templates. A fork carries the
    // lifter's edits and is theirs to delete.
    const programs = createProgramRepository(db)
    await programs.save({ ...aProgram(), id: asProgramId('built-in-531-bbb'), origin: 'fork' })

    const removed = await retireBuiltInPrograms(
      { ...deps(), instances: createInstanceRepository(db) },
      ['built-in-531-bbb'],
    )

    expect(removed).toEqual([])
    expect(await programs.byId(asProgramId('built-in-531-bbb'))).toBeDefined()
  })

  it('never retires a program an instance still points at', async () => {
    // Deleting the template a run refers to would leave that run's logged
    // history filed under nothing.
    const programs = createProgramRepository(db)
    const instances = createInstanceRepository(db)

    await programs.save({
      ...aProgram(),
      id: asProgramId('built-in-531-bbb'),
      origin: 'built-in',
    })
    await instances.save({
      id: asInstanceId('running'),
      programId: asProgramId('built-in-531-bbb'),
      templateSnapshot: { ...aProgram(), id: asProgramId('built-in-531-bbb') },
      name: 'Mid-cycle',
      startedAt: '2026-08-01T00:00:00.000Z',
      status: 'active',
      cycleNumber: 1,
      blockIndex: 0,
      weekIndex: 0,
      dayIndex: 0,
    })

    const removed = await retireBuiltInPrograms({ ...deps(), instances }, ['built-in-531-bbb'])

    expect(removed).toEqual([])
    expect(await programs.byId(asProgramId('built-in-531-bbb'))).toBeDefined()
  })

  it('reports every built-in id so delivery can be recorded', async () => {
    // The caller records `allIds`, not `added` — otherwise a program that
    // was present but never explicitly delivered stays unrecorded, and
    // deleting it later would bring it back.
    const result = await syncBuiltInPrograms(deps(), new Set())

    expect(result.allIds).toContain('built-in-rp-block')
    expect(result.allIds.length).toBe(BUILT_IN_PROGRAM_COUNT)
  })
})

describe('recording which built-ins were delivered', () => {
  const memoryStorage = (): Storage => {
    const map = new Map<string, string>()
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
      removeItem: (key) => void map.delete(key),
      clear: () => {
        map.clear()
      },
      key: (index) => [...map.keys()][index] ?? null,
      get length() {
        return map.size
      },
    }
  }

  it('round-trips ids', () => {
    const storage = memoryStorage()
    recordDeliveredBuiltIns(['a', 'b'], storage)

    expect([...readDeliveredBuiltIns(storage)]).toEqual(['a', 'b'])
  })

  it('merges rather than replaces', () => {
    // A later app version ships a new built-in. Recording it must not
    // forget that the earlier ones were already offered, or deleting one
    // of those would undo the delete.
    const storage = memoryStorage()
    recordDeliveredBuiltIns(['a'], storage)
    recordDeliveredBuiltIns(['b'], storage)

    expect([...readDeliveredBuiltIns(storage)]).toEqual(['a', 'b'])
  })

  it('treats a corrupt record as nothing delivered', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.deliveredBuiltIns, '{not json')

    expect(readDeliveredBuiltIns(storage).size).toBe(0)
  })

  it('survives storage that throws', () => {
    const base = memoryStorage()
    const throwing: Storage = Object.assign(base, {
      setItem: () => {
        throw new Error('quota')
      },
    })

    // Private-mode Safari. Startup must not depend on this succeeding.
    expect(recordDeliveredBuiltIns(['a'], throwing)).toBe(false)
  })
})
