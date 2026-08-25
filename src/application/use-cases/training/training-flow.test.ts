import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { builtInExercises, STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
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
import { skipSession } from './skip-session'
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
  estimatedMaxes: {
    [asExerciseId(STRENGTH_LIFT_SLUGS.squat)]: 350,
    [asExerciseId(STRENGTH_LIFT_SLUGS.bench)]: 250,
    [asExerciseId(STRENGTH_LIFT_SLUGS.deadlift)]: 450,
    [asExerciseId('overhead-press')]: 150,
  },
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

const RP_PROGRAM = asProgramId('built-in-rp-block')

async function beginProgram() {
  const deps = services()
  await startProgram(RP_PROGRAM, deps)
  return deps
}

describe('starting a session from a program', () => {
  it('resolves the day’s prescriptions into concrete numbers', async () => {
    const deps = await beginProgram()

    const result = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const press = result.workout.entries.find((entry) => entry.exerciseId === 'overhead-press')
    expect(press).toBeDefined()

    // Every hypertrophy set is held at 1 RIR except the last, which goes
    // to failure — the overhead press being one of the movements it is
    // safe to fail on.
    expect(press?.sets.map((set) => set.prescription.load)).toEqual([
      { kind: 'rpe', target: 9 },
      { kind: 'rpe', target: 9 },
      { kind: 'rpe', target: 9 },
      { kind: 'rpe', target: 10 },
    ])

    // 150 lb estimate, RPE 9 at the top of a 3–6 range.
    expect(press?.sets[0]?.plannedLoad).toBeGreaterThan(0)
  })

  it('leaves an RPE set performable when no estimate exists', async () => {
    // An RPE prescription is satisfied by feel, so a missing estimate
    // costs the lifter a suggested number and nothing else. Under 5/3/1
    // the same gap left the set with no load at all.
    const deps = await beginProgram()
    const bare: AthleteState = { ...athlete, estimatedMaxes: {} }

    const result = await startWorkout({ athlete: bare, roundingIncrement: 5 }, deps)
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const press = result.workout.entries.find((entry) => entry.exerciseId === 'overhead-press')
    expect(press?.sets.every((set) => set.plannedLoad === undefined)).toBe(true)
    expect(press?.sets[0]?.prescription.load).toEqual({ kind: 'rpe', target: 9 })
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

    const pressIndex = started.workout.entries.findIndex(
      (entry) => entry.exerciseId === 'overhead-press',
    )
    const plannedLoad = started.workout.entries[pressIndex]?.sets[0]?.plannedLoad

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: pressIndex,
        setIndex: 0,
        result: { load: 135, reps: 5, rpe: 9, outcome: 'completed' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const topSet = saved?.entries[pressIndex]?.sets[0]

    expect(topSet?.plannedLoad).toBe(plannedLoad)
    expect(topSet?.actualLoad).toBe(135)
    expect(topSet?.actualReps).toBe(5)
    expect(topSet?.outcome).toBe('completed')

    // The template is untouched. In LiftTracker this same action wrote
    // into the rows the program was made of.
    const program = await deps.programs.byId(RP_PROGRAM)
    const slot = program?.blocks[0]?.weeks[0]?.days[0]?.slots[pressIndex]
    expect(slot?.sets[0]?.load).toEqual({ kind: 'rpe', target: 9 })
  })

  it('clears the numbers off a skipped set', async () => {
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const pressIndex = started.workout.entries.findIndex(
      (entry) => entry.exerciseId === 'overhead-press',
    )

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: pressIndex,
        setIndex: 1,
        result: { load: 90, reps: 5, outcome: 'completed' },
      },
      deps,
    )
    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: pressIndex,
        setIndex: 1,
        result: { outcome: 'skipped' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const set = saved?.entries[pressIndex]?.sets[1]

    expect(set?.outcome).toBe('skipped')
    // A skipped set must not leave a partial record that later reads as
    // work performed — the volume totals depend on it.
    expect(set?.actualReps).toBeUndefined()
    expect(set?.actualLoad).toBeUndefined()
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

    const pressIndex = started.workout.entries.findIndex(
      (entry) => entry.exerciseId === 'overhead-press',
    )

    for (let setIndex = 0; setIndex <= 2; setIndex += 1) {
      await logSet(
        {
          workoutId: started.workout.id,
          entryIndex: pressIndex,
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

    // One working set logged; the mobility warm-ups that open the day and
    // everything else left untouched.
    const pressIndex = started.workout.entries.findIndex(
      (entry) => entry.exerciseId === 'overhead-press',
    )

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: pressIndex,
        setIndex: 0,
        result: { load: 100, reps: 5, outcome: 'completed' },
      },
      deps,
    )

    const report = await finishWorkout(started.workout.id, deps)
    expect(report.workingSets).toBe(1)
  })
})

describe('skipping a session', () => {
  it('moves the program on without writing a workout', async () => {
    // A day trained elsewhere, or simply missed. Logging an empty session
    // would advance the program *and* put a workout with no sets into the
    // history, where it counts as a training day and drags every
    // frequency and volume figure down.
    const deps = await beginProgram()

    const result = await skipSession(deps)

    expect(result.kind).toBe('skipped')
    expect((await deps.instances.active())?.dayIndex).toBe(1)
    expect(await deps.workouts.count()).toBe(0)
  })

  it('rolls into the next week like finishing does', async () => {
    const deps = await beginProgram()
    for (let day = 0; day < 4; day += 1) await skipSession(deps)

    const instance = await deps.instances.active()
    expect(instance?.weekIndex).toBe(1)
    expect(instance?.dayIndex).toBe(0)
  })

  it('refuses while a session is open', async () => {
    // Skipping past an in-progress workout would strand it: still open,
    // but attached to a day the program has already moved off.
    const deps = await beginProgram()
    const started = await startWorkout({ athlete, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const result = await skipSession(deps)

    expect(result.kind).toBe('session-in-progress')
    expect((await deps.instances.active())?.dayIndex).toBe(0)
  })

  it('reports having no program rather than failing', async () => {
    expect((await skipSession(services())).kind).toBe('no-program')
  })
})

describe('the built-in exercise library', () => {
  it('contains every lift the built-in programs reference', () => {
    const library = new Set(builtInExercises().map((exercise) => exercise.id as string))

    for (const slug of Object.values(STRENGTH_LIFT_SLUGS)) {
      expect(library.has(slug), `${slug} is missing from the catalogue`).toBe(true)
    }
  })
})
