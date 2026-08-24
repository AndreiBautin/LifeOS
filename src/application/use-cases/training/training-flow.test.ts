import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { builtInExercises, MAIN_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { Clock } from '@/domain/repositories/ports'
import type { AthleteState } from '@/domain/resolution/resolve'
import { startProgram } from '@/application/use-cases/programs/manage-programs'
import {
  closeLiftDatabase,
  openLiftDatabase,
  type LiftDatabase,
} from '@/infrastructure/db/database'
import {
  createExerciseRepository,
  createInstanceRepository,
  createProgramRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { seedIfEmpty } from '@/infrastructure/seed/seed'

import { finishWorkout } from './finish-workout'
import { logSet } from './log-set'
import { startWorkout } from './start-workout'

/**
 * The whole loop, end to end.
 *
 * Runs against a real (fake-indexeddb backed) database rather than mocks,
 * because the behaviours worth protecting here are exactly the ones that
 * span layers: a training max resolving into a prescription, a logged set
 * landing in the log rather than in the program, and the program
 * advancing by one day when a session finishes.
 */

const TEST_DB = 'lift-flow-test'

let db: LiftDatabase
let clock: Clock
let currentTime = new Date('2026-08-24T09:00:00.000Z')

function counterIds(): IdGenerator {
  let n = 0
  return {
    next: () => {
      n += 1
      return `id-${String(n)}`
    },
  }
}

const athlete: AthleteState = {
  trainingMaxes: {
    [asExerciseId(MAIN_LIFT_SLUGS.squat)]: 315,
    [asExerciseId(MAIN_LIFT_SLUGS.bench)]: 225,
    [asExerciseId(MAIN_LIFT_SLUGS.deadlift)]: 405,
    [asExerciseId(MAIN_LIFT_SLUGS.press)]: 135,
  },
  estimatedMaxes: {},
  bodyweight: 180,
  units: 'lb',
}

function services() {
  return {
    db,
    exercises: createExerciseRepository(db),
    programs: createProgramRepository(db),
    instances: createInstanceRepository(db),
    workouts: createWorkoutRepository(db),
    ids: counterIds(),
    clock,
  }
}

beforeEach(async () => {
  currentTime = new Date('2026-08-24T09:00:00.000Z')
  clock = { now: () => currentTime }

  db = await openLiftDatabase(TEST_DB)
  await seedIfEmpty({
    exercises: createExerciseRepository(db),
    programs: createProgramRepository(db),
    ids: counterIds(),
    now: currentTime,
  })
})

afterEach(async () => {
  await closeLiftDatabase()
  await deleteDB(TEST_DB)
})

const BBB_PROGRAM = asProgramId('built-in-531-bbb')

async function beginProgram() {
  const deps = services()
  await startProgram(BBB_PROGRAM, athlete, deps)
  return deps
}

describe('starting a session from a program', () => {
  it('resolves the day’s prescriptions into concrete numbers', async () => {
    const deps = await beginProgram()

    const result = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const main = result.workout.entries[0]
    expect(main?.role).toBe('main')
    expect(main?.exerciseId).toBe(MAIN_LIFT_SLUGS.press)

    // 135 lb training max, week 1: 40/50/60% warm-ups then 65/75/85%.
    expect(main?.sets.map((set) => set.plannedLoad)).toEqual([55, 70, 80, 90, 100, 115])
    expect(main?.sets.filter((set) => set.isWarmup)).toHaveLength(3)
  })

  it('leaves a percentage set without a number when the training max is missing', async () => {
    const deps = await beginProgram()
    const bare: AthleteState = { ...athlete, trainingMaxes: {} }

    const result = await startWorkout({ athlete: bare, roundingIncrement: 5 }, deps)
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const main = result.workout.entries[0]
    expect(main?.sets.every((set) => set.plannedLoad === undefined)).toBe(true)
    // The prescription survives, so the UI can still say what was asked for.
    expect(main?.sets[3]?.prescription.load).toEqual({
      kind: 'percent-training-max',
      percent: 65,
    })
  })

  it('resumes an unfinished session rather than starting a second', async () => {
    // The most common way a training app loses real data: a half-logged
    // session orphaned by a fresh start.
    const deps = await beginProgram()

    const first = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (first.kind !== 'started') throw new Error('expected a started workout')

    const second = await startWorkout({ athlete, roundingIncrement: 5 }, deps)

    expect(second.kind).toBe('resumed')
    if (second.kind !== 'resumed') throw new Error('expected a resumed workout')
    expect(second.workout.id).toBe(first.workout.id)
    expect(await deps.workouts.count()).toBe(1)
  })

  it('reports having no program rather than failing', async () => {
    const result = await startWorkout({ athlete, roundingIncrement: 5 }, services())

    expect(result.kind).toBe('no-program')
  })

  it('logs a session with no program attached', async () => {
    const deps = services()
    const result = await startWorkout(
      { athlete, roundingIncrement: 5, freestyleTitle: 'Open session' },
      deps,
    )

    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('expected a started workout')
    expect(result.workout.position).toBeUndefined()
    expect(result.workout.title).toBe('Open session')
  })
})

describe('logging', () => {
  it('records the actual alongside the planned, without touching the program', async () => {
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: 0,
        setIndex: 5,
        result: { load: 115, reps: 9, rpe: 9, outcome: 'completed' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const topSet = saved?.entries[0]?.sets[5]

    expect(topSet?.plannedLoad).toBe(115)
    expect(topSet?.actualReps).toBe(9)
    expect(topSet?.outcome).toBe('completed')

    // The template is untouched. In LiftTracker this same action wrote
    // into the rows the program was made of.
    const program = await deps.programs.byId(BBB_PROGRAM)
    const slot = program?.blocks[0]?.weeks[0]?.days[0]?.slots[0]
    expect(slot?.sets[5]?.reps).toEqual({ kind: 'amrap', minimum: 5 })
  })

  it('clears the numbers off a skipped set', async () => {
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: 0,
        setIndex: 3,
        result: { load: 90, reps: 5, outcome: 'completed' },
      },
      deps,
    )
    await logSet(
      { workoutId: started.workout.id, entryIndex: 0, setIndex: 3, result: { outcome: 'skipped' } },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const set = saved?.entries[0]?.sets[3]

    expect(set?.outcome).toBe('skipped')
    // A skipped set must not leave a partial record that later reads as
    // work performed — the volume totals depend on it.
    expect(set?.actualReps).toBeUndefined()
    expect(set?.actualLoad).toBeUndefined()
    expect(set?.plannedLoad).toBe(90)
  })
})

describe('finishing a session', () => {
  it('advances the program by one day', async () => {
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    expect((await deps.instances.active())?.dayIndex).toBe(0)

    currentTime = new Date('2026-08-24T10:15:00.000Z')
    await finishWorkout(started.workout.id, deps)

    const instance = await deps.instances.active()
    expect(instance?.dayIndex).toBe(1)
    expect(instance?.weekIndex).toBe(0)
  })

  it('rolls into the next week after the last day', async () => {
    const deps = await beginProgram()

    // Four training days in this split, so four finished sessions should
    // land on week 2 day 1.
    for (let day = 0; day < 4; day += 1) {
      const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
      if (started.kind !== 'started') throw new Error('expected a started workout')
      await finishWorkout(started.workout.id, deps)
    }

    const instance = await deps.instances.active()
    expect(instance?.weekIndex).toBe(1)
    expect(instance?.dayIndex).toBe(0)
  })

  it('advances on completion rather than on the calendar', async () => {
    // Both source apps derived the current day from elapsed time, so a
    // missed Tuesday put the program permanently out of step. A program
    // here is a queue.
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    currentTime = new Date('2026-09-30T18:00:00.000Z')
    await finishWorkout(started.workout.id, deps)

    expect((await deps.instances.active())?.dayIndex).toBe(1)
  })

  it('reports volume by muscle and progress against last time', async () => {
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    for (let setIndex = 3; setIndex <= 5; setIndex += 1) {
      await logSet(
        {
          workoutId: started.workout.id,
          entryIndex: 0,
          setIndex,
          result: { load: 100, reps: 5, outcome: 'completed' },
        },
        deps,
      )
    }

    currentTime = new Date('2026-08-24T10:20:00.000Z')
    const report = await finishWorkout(started.workout.id, deps)

    expect(report.workingSets).toBe(3)
    expect(report.tonnage).toBe(1500)
    expect(report.durationMinutes).toBe(80)
    expect(report.progress[0]?.verdict).toBe('new')
    expect(report.volumeByMuscle.map((entry) => entry.muscle)).toContain('front-delts')
  })

  it('excludes warm-ups and unperformed sets from the volume it reports', async () => {
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    // Only one working set logged; three warm-ups and everything else
    // left untouched.
    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: 0,
        setIndex: 4,
        result: { load: 100, reps: 5, outcome: 'completed' },
      },
      deps,
    )

    const report = await finishWorkout(started.workout.id, deps)
    expect(report.workingSets).toBe(1)
  })
})

describe('the built-in exercise library', () => {
  it('contains every lift the built-in programs reference', () => {
    const library = new Set(builtInExercises().map((exercise) => exercise.id as string))

    for (const slug of Object.values(MAIN_LIFT_SLUGS)) {
      expect(library.has(slug), `${slug} is missing from the catalogue`).toBe(true)
    }
  })
})
