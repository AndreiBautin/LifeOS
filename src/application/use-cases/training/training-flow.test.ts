import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { builtInExercises, STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId, type IdGenerator } from '@/domain/ids/ids'
import type { Clock } from '@/domain/repositories/ports'
import type { AthleteState } from '@/domain/resolution/resolve'
import { deriveProgram } from '@/application/use-cases/programs/current-program'
import {
  closeLiftDatabase,
  openLiftDatabase,
  type LiftDatabase,
} from '@/infrastructure/db/database'
import {
  createExerciseRepository,
  createPositionRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { abandonWorkout } from './abandon-workout'
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
    // Monday is arms and delts, so the curl is the day-one exercise a
    // suggested load can be checked against.
    [asExerciseId('db-curl')]: 60,
  },
  bodyweight: 180,
  units: 'lb',
}

let program: ReturnType<typeof deriveProgram>

function services() {
  return {
    db,
    exercises: createExerciseRepository(db),
    position: createPositionRepository(db),
    workouts: createWorkoutRepository(db),
    ids: counterIds(),
    clock,
    program,
  }
}

beforeEach(async () => {
  currentTime = new Date('2026-08-24T09:00:00.000Z')
  clock = { now: () => currentTime }

  db = await openLiftDatabase(TEST_DB)
  // Derived from settings, exactly as the app derives it.
  program = deriveProgram(DEFAULT_SETTINGS, builtInExercises())
})

afterEach(async () => {
  await closeLiftDatabase()
  await deleteDB(TEST_DB)
})

/**
 * There is nothing to begin.
 *
 * The program is derived from settings, so a lifter simply has one. The
 * position starts at the beginning and is written the first time a
 * session is opened.
 */
function beginProgram() {
  return services()
}

describe('starting a session from a program', () => {
  it('resolves the day’s prescriptions into concrete numbers', async () => {
    const deps = beginProgram()

    const result = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const curl = result.workout.entries.find((entry) => entry.exerciseId === 'db-curl')
    expect(curl).toBeDefined()

    /*
     * Every set at 1 RIR except the last, which goes to failure.
     *
     * The curl is safe to fail on and runs 5–30 like every other
     * hypertrophy movement, so the heavy-set exemption does not apply.
     * Asserted as a shape rather than a fixed count, because how many
     * sets it gets is a volume decision that moves with the tiers and the
     * day count.
     */
    const loads = curl?.sets.map((set) => set.prescription.load) ?? []

    expect(loads.length).toBeGreaterThan(1)
    expect(loads.slice(0, -1)).toEqual(loads.slice(0, -1).map(() => ({ kind: 'rpe', target: 9 })))
    expect(loads.at(-1)).toEqual({ kind: 'rpe', target: 10 })

    // A 60 lb estimate resolves to a suggested weight through the chart.
    expect(curl?.sets[0]?.plannedLoad).toBeGreaterThan(0)
  })

  it('leaves an RPE set performable when no estimate exists', async () => {
    // An RPE prescription is satisfied by feel, so a missing estimate
    // costs the lifter a suggested number and nothing else. Under 5/3/1
    // the same gap left the set with no load at all.
    const deps = beginProgram()
    const bare: AthleteState = { ...athlete, estimatedMaxes: {} }

    const result = await startWorkout({ athlete: bare, program, roundingIncrement: 5 }, deps)
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const curl = result.workout.entries.find((entry) => entry.exerciseId === 'db-curl')
    expect(curl?.sets.every((set) => set.plannedLoad === undefined)).toBe(true)
    expect(curl?.sets[0]?.prescription.load).toEqual({ kind: 'rpe', target: 9 })
  })

  it('resumes an unfinished session rather than starting a second', async () => {
    // The most common way a training app loses real data: a half-logged
    // session orphaned by a fresh start.
    const deps = beginProgram()

    const first = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (first.kind !== 'started') throw new Error('expected a started workout')

    const second = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)

    expect(second.kind).toBe('resumed')
    if (second.kind !== 'resumed') throw new Error('expected a resumed workout')
    expect(second.workout.id).toBe(first.workout.id)
    expect(await deps.workouts.count()).toBe(1)
  })

  it('always has a program, because it is derived rather than chosen', async () => {
    // There is no "no program running" state any more. A lifter who has
    // never opened the app still has settings, and settings are a
    // program — which is the whole point of deriving it.
    const result = await startWorkout({ athlete, program, roundingIncrement: 5 }, services())

    expect(result.kind).toBe('started')
  })

  it('logs a session with no program attached', async () => {
    const deps = services()
    const result = await startWorkout(
      { athlete, program, roundingIncrement: 5, freestyleTitle: 'Open session' },
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
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const curlIndex = started.workout.entries.findIndex((entry) => entry.exerciseId === 'db-curl')
    const plannedLoad = started.workout.entries[curlIndex]?.sets[0]?.plannedLoad

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: curlIndex,
        setIndex: 0,
        result: { load: 135, reps: 5, rpe: 9, outcome: 'completed' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const topSet = saved?.entries[curlIndex]?.sets[0]

    expect(topSet?.plannedLoad).toBe(plannedLoad)
    expect(topSet?.actualLoad).toBe(135)
    expect(topSet?.actualReps).toBe(5)
    expect(topSet?.outcome).toBe('completed')

    // Logging cannot touch the program, because there is no stored
    // program to touch — re-deriving from the same settings gives back
    // exactly the same thing. In LiftTracker this same action wrote into
    // the rows the program was made of.
    expect(deriveProgram(DEFAULT_SETTINGS, builtInExercises())).toEqual(program)
  })

  it('clears the numbers off a skipped set', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const curlIndex = started.workout.entries.findIndex((entry) => entry.exerciseId === 'db-curl')

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: curlIndex,
        setIndex: 1,
        result: { load: 90, reps: 5, outcome: 'completed' },
      },
      deps,
    )
    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: curlIndex,
        setIndex: 1,
        result: { outcome: 'skipped' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const set = saved?.entries[curlIndex]?.sets[1]

    expect(set?.outcome).toBe('skipped')
    // A skipped set must not leave a partial record that later reads as
    // work performed — the volume totals depend on it.
    expect(set?.actualReps).toBeUndefined()
    expect(set?.actualLoad).toBeUndefined()
  })
})

describe('finishing a session', () => {
  it('advances the program by one day', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    expect((await deps.position.get())?.dayIndex).toBe(0)

    currentTime = new Date('2026-08-24T10:15:00.000Z')
    await finishWorkout(started.workout.id, deps)

    const instance = await deps.position.get()
    expect(instance?.dayIndex).toBe(1)
    expect(instance?.weekIndex).toBe(0)
  })

  it('rolls into the next week after the last day', async () => {
    const deps = beginProgram()

    // Five training days in this split, so five finished sessions should
    // land on week 2 day 1.
    for (let day = 0; day < 5; day += 1) {
      const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
      if (started.kind !== 'started') throw new Error('expected a started workout')
      await finishWorkout(started.workout.id, deps)
    }

    const instance = await deps.position.get()
    expect(instance?.weekIndex).toBe(1)
    expect(instance?.dayIndex).toBe(0)
  })

  it('advances on completion rather than on the calendar', async () => {
    // Both source apps derived the current day from elapsed time, so a
    // missed Tuesday put the program permanently out of step. A program
    // here is a queue.
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    currentTime = new Date('2026-09-30T18:00:00.000Z')
    await finishWorkout(started.workout.id, deps)

    expect((await deps.position.get())?.dayIndex).toBe(1)
  })

  it('reports volume by muscle and progress against last time', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const curlIndex = started.workout.entries.findIndex((entry) => entry.exerciseId === 'db-curl')

    for (let setIndex = 0; setIndex <= 2; setIndex += 1) {
      await logSet(
        {
          workoutId: started.workout.id,
          entryIndex: curlIndex,
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
    // The curl is filed under biceps and pays the forearms a fraction.
    expect(report.volumeByMuscle.map((entry) => entry.muscle)).toContain('biceps')
  })

  it('excludes warm-ups and unperformed sets from the volume it reports', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    // One working set logged; the mobility warm-ups that open the day and
    // everything else left untouched.
    const curlIndex = started.workout.entries.findIndex((entry) => entry.exerciseId === 'db-curl')

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: curlIndex,
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
    const deps = beginProgram()

    const result = await skipSession(deps)

    expect(result.kind).toBe('skipped')
    expect((await deps.position.get())?.dayIndex).toBe(1)
    expect(await deps.workouts.count()).toBe(0)
  })

  it('rolls into the next week like finishing does', async () => {
    const deps = beginProgram()
    for (let day = 0; day < 5; day += 1) await skipSession(deps)

    const instance = await deps.position.get()
    expect(instance?.weekIndex).toBe(1)
    expect(instance?.dayIndex).toBe(0)
  })

  it('refuses while a session is open', async () => {
    // Skipping past an in-progress workout would strand it: still open,
    // but attached to a day the program has already moved off.
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const result = await skipSession(deps)

    expect(result.kind).toBe('session-in-progress')
    expect((await deps.position.get())?.dayIndex).toBe(0)
  })

  it('skips from the beginning when nothing has been trained yet', async () => {
    // A week that starts on a Wednesday. There is no stored position and
    // no program to be missing, so this lands on day two rather than
    // reporting a state that cannot occur under a derived program.
    const deps = services()

    expect((await skipSession(deps)).kind).toBe('skipped')
    expect((await deps.position.get())?.dayIndex).toBe(1)
  })
})

describe('abandoning a session', () => {
  it('discards a session nothing was logged against', () => {
    // Opened by accident. The record describes an event that did not
    // happen, and keeping it would leave an empty session in the history
    // to be explained forever.
    return (async () => {
      const deps = beginProgram()
      const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
      if (started.kind !== 'started') throw new Error('expected a started workout')

      const result = await abandonWorkout(started.workout.id, deps)

      expect(result.kind).toBe('discarded')
      expect(await deps.workouts.count()).toBe(0)
      expect(await deps.workouts.inProgress()).toBeUndefined()
    })()
  })

  it('keeps the work when some was logged', async () => {
    // Three sets before the gym closed are still three sets. Deleting
    // them to tidy up the history would throw away training.
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const curlIndex = started.workout.entries.findIndex((entry) => entry.exerciseId === 'db-curl')
    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: curlIndex,
        setIndex: 0,
        result: { load: 135, reps: 5, outcome: 'completed' },
      },
      deps,
    )

    const result = await abandonWorkout(started.workout.id, deps)

    expect(result.kind).toBe('kept')
    expect(await deps.workouts.count()).toBe(1)
    expect((await deps.workouts.byId(started.workout.id))?.status).toBe('abandoned')
  })

  it('leaves the program on the same day either way', async () => {
    // The day was not finished. Advancing would silently cost the lifter
    // a session out of the block.
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    await abandonWorkout(started.workout.id, deps)

    expect((await deps.position.get())?.dayIndex).toBe(0)
  })

  it('frees the lifter to start the session again', async () => {
    const deps = beginProgram()
    const first = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (first.kind !== 'started') throw new Error('expected a started workout')

    await abandonWorkout(first.workout.id, deps)
    const second = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)

    // A fresh session, not a resume of the abandoned one.
    expect(second.kind).toBe('started')
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
