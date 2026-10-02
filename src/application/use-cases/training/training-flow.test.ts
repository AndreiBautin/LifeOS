import { deleteDB } from 'idb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { builtInExercises, STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId, type ExerciseId, type IdGenerator } from '@/domain/ids/ids'
import type { Clock } from '@/domain/repositories/ports'
import type { AthleteState } from '@/domain/resolution/resolve'
import { deriveProgram } from '@/application/use-cases/programs/current-program'
import { closeAppDatabase, openDatabase, type AppDatabase } from '@/infrastructure/db/database'
import {
  createExerciseRepository,
  createPositionRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { abandonWorkout } from './abandon-workout'
import { finishWorkout } from './finish-workout'
import { STRENGTH_RANGE } from '@/domain/programs/progression'
import { logSet } from './log-set'
import { startWorkout } from './start-workout'

/** Fixed, so a stamped updatedAt is reproducible. */
const testClock = { now: () => new Date('2026-08-25T09:00:00.000Z') }

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

let db: AppDatabase
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
  working: {},
  estimatedMaxes: {
    [asExerciseId(STRENGTH_LIFT_SLUGS.squat)]: 350,
    [asExerciseId(STRENGTH_LIFT_SLUGS.bench)]: 250,
    [asExerciseId(STRENGTH_LIFT_SLUGS.deadlift)]: 450,
    /*
     * Day one is Push, which carries triceps isolation — the day-one
     * exercise a suggested load can be checked against. *Which* one is
     * the routine's business, not this test's, so every variant carries
     * a max and the tests below find whichever one turned up.
     *
     * It was a curl while day one was the full-body Monday. Naming the
     * exercise was how these tests failed once already: a suite about
     * resolution and logging, broken by a change to what a day holds.
     */
    [asExerciseId('skullcrusher')]: 60,
    [asExerciseId('french-press')]: 60,
  },
  bodyweight: 180,
  units: 'lb',
}

/**
 * Whichever triceps isolation the day holds.
 *
 * Read off the catalogue rather than listed here, so adding one does not
 * break a suite that has no opinion about triceps work.
 */
const ACCESSORIES = new Set(
  builtInExercises()
    .filter((exercise) => exercise.primaryMuscle === 'triceps' && !exercise.isCompound)
    .map((exercise) => exercise.id as string),
)

const isAccessory = (id: ExerciseId): boolean => ACCESSORIES.has(id)

let program: ReturnType<typeof deriveProgram>

function services() {
  return {
    db,
    exercises: createExerciseRepository(db, testClock),
    position: createPositionRepository(db, clock),
    workouts: createWorkoutRepository(db, testClock),
    ids: counterIds(),
    roundingIncrement: 5,
    exerciseFor: (id: ExerciseId) => builtInExercises().find((e) => e.id === id),
    clock,
    program,
  }
}

beforeEach(async () => {
  currentTime = new Date('2026-08-24T09:00:00.000Z')
  clock = { now: () => currentTime }

  db = await openDatabase(TEST_DB)
  // Derived from settings, exactly as the app derives it.
  program = deriveProgram(DEFAULT_SETTINGS, builtInExercises())
})

afterEach(async () => {
  await closeAppDatabase()
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

/** Moves the clock on a day — the only thing that changes which session is offered. */
function nextDay() {
  currentTime = new Date(currentTime.getTime() + 86_400_000)
}

/**
 * The first session in the week that opens on a competition lift.
 *
 * Walked forward a day at a time rather than assumed to be Monday: which
 * day carries which lift is the split's business, and Monday is an
 * overhead-press day. A test about how a strength lift opens has no
 * opinion on that.
 */
async function startOnAStrengthDay(deps: ReturnType<typeof beginProgram>) {
  for (let day = 0; day < 7; day += 1) {
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')
    if (started.workout.entries.some((entry) => entry.role === 'strength')) return started
    await abandonWorkout(started.workout.id, deps)
    nextDay()
  }
  throw new Error('no day in the week opens on a competition lift')
}

describe('starting a session from a program', () => {
  it('resolves the day’s prescriptions into concrete numbers', async () => {
    const deps = beginProgram()

    const result = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('expected a started workout')

    const curl = result.workout.entries.find((entry) => isAccessory(entry.exerciseId))
    expect(curl).toBeDefined()

    /*
     * **Straight sets at a working load, and no RPE anywhere.** This
     * asserted 1 RIR on every set and failure on the last, which is what
     * RTS-era hypertrophy prescribed; the method is double progression
     * now and every set is identical.
     */
    const loads = curl?.sets.map((set) => set.prescription.load) ?? []

    expect(loads.length).toBeGreaterThan(1)
    expect(loads).toEqual(loads.map(() => ({ kind: 'working' })))

    /*
     * **And it resolves to nothing, which is the point of `working`.**
     * This device has never logged a curl, so there is no load to carry
     * forward and the set is open — the lifter types what they did and
     * it carries from then on. It used to resolve through the RPE chart
     * off an estimate, which is precisely the guess that was removed.
     */
    expect(curl?.sets[0]?.plannedLoad).toBeUndefined()
  })

  /*
   * The other side of that rule, and the reason it is a rule rather than
   * an oversight. A strength slot with no history opens at a share of the
   * estimated max — a first bench session with a blank bar, on a device
   * holding a bench figure the lifter typed themselves, is a worse answer
   * than a conservative suggestion they overwrite.
   *
   * The curl above has an estimate too and is still open, because the
   * share is only meaningful against the strength range: 85% is about a
   * five-rep load and the curl is asking for fifteen to thirty.
   */
  it('opens a strength lift at a share of its estimated max the first time', async () => {
    const deps = beginProgram()
    const result = await startOnAStrengthDay(deps)

    const strength = result.workout.entries.find((entry) => entry.role === 'strength')
    expect(strength).toBeDefined()

    const basis = athlete.estimatedMaxes[strength?.exerciseId ?? asExerciseId('none')]
    expect(basis).toBeDefined()

    const planned = strength?.sets.find((set) => !set.isWarmup)?.plannedLoad
    expect(planned).toBeDefined()
    expect(planned).toBeLessThan(basis ?? 0)
    expect(planned).toBeGreaterThan((basis ?? 0) * 0.7)
  })

  /*
   * And it is the *first* time only. Once a session is filed the log is
   * the source, which is what stops an estimate edited months later from
   * silently rewriting a load the lifter has been progressing by hand.
   */
  it('carries the logged load forward rather than re-seeding from the estimate', async () => {
    const deps = beginProgram()
    const first = await startOnAStrengthDay(deps)

    const index = first.workout.entries.findIndex((entry) => entry.role === 'strength')
    const entry = first.workout.entries[index]
    if (entry === undefined) throw new Error('expected a strength entry')

    for (const [setIndex, set] of entry.sets.entries()) {
      if (set.isWarmup) continue
      await logSet(
        {
          workoutId: first.workout.id,
          entryIndex: index,
          setIndex,
          result: { load: 100, reps: 5, outcome: 'completed' },
        },
        deps,
      )
    }

    await finishWorkout(first.workout.id, deps)

    /*
     * Walked forward until the same lift comes round again rather than a
     * fixed number of days: which day carries which lift is the split's
     * business and this test has no opinion on it.
     */
    let again
    for (let day = 0; day < 10 && again === undefined; day += 1) {
      nextDay()
      const next = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
      if (next.kind !== 'started') throw new Error('expected a started workout')

      again = next.workout.entries.find((candidate) => candidate.exerciseId === entry.exerciseId)
      if (again === undefined) await abandonWorkout(next.workout.id, deps)
    }

    /*
     * 100 topped at five reps, so the next session is one step heavier —
     * nowhere near the 85% of an estimated max it opened at. The step is
     * whichever `stepFor` gives this lift, so it is read rather than
     * written in: what is being asserted is that the load came from the
     * log, not from the estimate.
     */
    const planned = again?.sets.find((set) => !set.isWarmup)?.plannedLoad
    expect(planned).toBeGreaterThan(100)
    expect(planned).toBeLessThanOrEqual(110)

    // The load went up, so the reps start again at the bottom of the range.
    expect(again?.sets.filter((set) => !set.isWarmup).map((set) => set.plannedReps)).toEqual(
      again?.sets.filter((set) => !set.isWarmup).map(() => STRENGTH_RANGE.low),
    )
  })

  /*
   * The other half of double progression, and the part the plan used to
   * leave to memory: below the top of the range the load holds and each
   * set aims one rep past what it managed last time. It planned the
   * bottom of the range on every set, beside a "Last" line that said
   * more.
   */
  /*
   * Dips are bodyweight and run 5–30. Logged with no load, twelve reps on
   * every set: under the compound range that read as topped and put a
   * belt on at five reps; under no-load-means-no-history it planned
   * nothing at all. Both were reported from the same session.
   */
  it('plans a bodyweight lift from reps alone, against today’s range', async () => {
    const deps = beginProgram()
    const first = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (first.kind !== 'started') throw new Error('expected a started workout')

    const index = first.workout.entries.findIndex((entry) => entry.exerciseId === 'dips')
    const entry = first.workout.entries[index]
    if (entry === undefined) throw new Error('expected dips on Monday')

    for (const [setIndex, set] of entry.sets.entries()) {
      if (set.isWarmup) continue
      await logSet(
        {
          workoutId: first.workout.id,
          entryIndex: index,
          setIndex,
          result: { reps: 12, outcome: 'completed' },
        },
        deps,
      )
    }
    await finishWorkout(first.workout.id, deps)

    for (let day = 0; day < 7; day += 1) nextDay()
    const again = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (again.kind !== 'started') throw new Error('expected a started workout')

    const sets =
      again.workout.entries
        .find((one) => one.exerciseId === 'dips')
        ?.sets.filter((set) => !set.isWarmup) ?? []
    expect(sets[0]?.prescription.reps).toMatchObject({ kind: 'range', low: 5, high: 30 })
    expect(sets.map((set) => set.plannedLoad)).toEqual(sets.map(() => 0))
    expect(sets.map((set) => set.plannedReps)).toEqual(sets.map(() => 13))
  })

  it('plans one straight target, one past the weakest set, while the load holds', async () => {
    const deps = beginProgram()
    const first = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (first.kind !== 'started') throw new Error('expected a started workout')

    const index = first.workout.entries.findIndex((entry) => isAccessory(entry.exerciseId))
    const entry = first.workout.entries[index]
    if (entry === undefined) throw new Error('expected an accessory')

    const done = [8, 7, 7, 6, 5]
    let working = 0
    for (const [setIndex, set] of entry.sets.entries()) {
      if (set.isWarmup) continue
      await logSet(
        {
          workoutId: first.workout.id,
          entryIndex: index,
          setIndex,
          result: { load: 50, reps: done[working++] ?? 5, outcome: 'completed' },
        },
        deps,
      )
    }
    await finishWorkout(first.workout.id, deps)

    // The same day next week.
    for (let day = 0; day < 7; day += 1) nextDay()
    const again = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (again.kind !== 'started') throw new Error('expected a started workout')

    const next = again.workout.entries.find((one) => one.exerciseId === entry.exerciseId)
    const sets = next?.sets.filter((set) => !set.isWarmup) ?? []
    const range = sets[0]?.prescription.reps
    if (range?.kind !== 'range') throw new Error('expected a rep range')

    expect(sets.map((set) => set.plannedLoad)).toEqual(sets.map(() => 50))
    // 8, 7, 7, 6, 5 has not held six reps on every set: six on all five.
    expect(sets.map((set) => set.plannedReps)).toEqual(
      sets.map(() => Math.min(range.high, Math.max(range.low, Math.min(...done) + 1))),
    )
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

    const accessoryIndex = started.workout.entries.findIndex((entry) =>
      isAccessory(entry.exerciseId),
    )
    const plannedLoad = started.workout.entries[accessoryIndex]?.sets[0]?.plannedLoad

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: accessoryIndex,
        setIndex: 0,
        result: { load: 135, reps: 5, outcome: 'completed' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const topSet = saved?.entries[accessoryIndex]?.sets[0]

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

    const accessoryIndex = started.workout.entries.findIndex((entry) =>
      isAccessory(entry.exerciseId),
    )

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: accessoryIndex,
        setIndex: 1,
        result: { load: 90, reps: 5, outcome: 'completed' },
      },
      deps,
    )
    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: accessoryIndex,
        setIndex: 1,
        result: { outcome: 'skipped' },
      },
      deps,
    )

    const saved = await deps.workouts.byId(started.workout.id)
    const set = saved?.entries[accessoryIndex]?.sets[1]

    expect(set?.outcome).toBe('skipped')
    // A skipped set must not leave a partial record that later reads as
    // work performed — the volume totals depend on it.
    expect(set?.actualReps).toBeUndefined()
    expect(set?.actualLoad).toBeUndefined()
  })
})

describe('the calendar decides the session', () => {
  // 2026-08-24, where the clock starts, is a Monday.
  it('opens the session today is scheduled for', async () => {
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, beginProgram())
    if (started.kind !== 'started') throw new Error('expected a started workout')
    expect(started.workout.title).toBe('Monday — Push A')
  })

  it('offers tomorrow’s session once today’s is finished', async () => {
    const deps = beginProgram()
    const today = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (today.kind !== 'started') throw new Error('expected a started workout')
    await finishWorkout(today.workout.id, deps)

    const early = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (early.kind !== 'started') throw new Error('expected a started workout')
    expect(early.workout.title).toBe('Tuesday — Pull A')
  })

  /*
   * The reason the cursor went. Missing Tuesday used to hold Pull A over
   * to Wednesday and slide every later day one place out of the routine.
   */
  it('does not hold a missed day over', async () => {
    const deps = beginProgram()
    nextDay()
    nextDay()

    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')
    expect(started.workout.title).toBe('Wednesday — Legs A')
  })

  it('moves nothing when a session is finished', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')
    const before = await deps.position.get()

    currentTime = new Date('2026-08-24T10:15:00.000Z')
    await finishWorkout(started.workout.id, deps)

    expect((await deps.position.get())?.blockStartedOn).toBe(before?.blockStartedOn)
    expect(before?.blockStartedOn).toBe('2026-08-24')
  })
})

describe('finishing a session', () => {
  it('reports volume by muscle and progress against last time', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    const accessoryIndex = started.workout.entries.findIndex((entry) =>
      isAccessory(entry.exerciseId),
    )

    for (let setIndex = 0; setIndex <= 2; setIndex += 1) {
      await logSet(
        {
          workoutId: started.workout.id,
          entryIndex: accessoryIndex,
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
    // The accessory is filed under the muscle it is programmed for.
    expect(report.volumeByMuscle.map((entry) => entry.muscle)).toContain('triceps')
  })

  it('excludes warm-ups and unperformed sets from the volume it reports', async () => {
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    // One working set logged; the mobility warm-ups that open the day and
    // everything else left untouched.
    const accessoryIndex = started.workout.entries.findIndex((entry) =>
      isAccessory(entry.exerciseId),
    )

    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: accessoryIndex,
        setIndex: 0,
        result: { load: 100, reps: 5, outcome: 'completed' },
      },
      deps,
    )

    const report = await finishWorkout(started.workout.id, deps)
    expect(report.workingSets).toBe(1)
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

    const accessoryIndex = started.workout.entries.findIndex((entry) =>
      isAccessory(entry.exerciseId),
    )
    await logSet(
      {
        workoutId: started.workout.id,
        entryIndex: accessoryIndex,
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

  it('leaves today’s session on offer', async () => {
    // The day was not finished, so it is still the day's session — an
    // abandoned log does not count as today's being done.
    const deps = beginProgram()
    const started = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (started.kind !== 'started') throw new Error('expected a started workout')

    await abandonWorkout(started.workout.id, deps)

    const again = await startWorkout({ athlete, program, roundingIncrement: 5 }, deps)
    if (again.kind !== 'started') throw new Error('expected a started workout')
    expect(again.workout.title).toBe(started.workout.title)
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
