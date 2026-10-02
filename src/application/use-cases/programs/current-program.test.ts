import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import { STARTING_POSITION } from '@/domain/programs/position'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { clampPosition, deriveProgram } from './current-program'

/**
 * Deriving the program instead of storing it.
 *
 * The whole point is that a stored copy cannot go stale if there is no
 * stored copy. Two properties make that viable rather than merely
 * appealing, and both are asserted here: the same settings must produce
 * the identical program, and a position must survive the program
 * changing shape underneath it.
 */

const library = builtInExercises()
const start = { ...STARTING_POSITION, startedAt: '2026-08-24T00:00:00.000Z' }

describe('deriving the program', () => {
  it('produces an identical program from identical settings', () => {
    // Including slot ids. A workout in progress refers to its day by
    // position and its sets by index; a program that differed between
    // reads would make every one of those references a guess.
    expect(deriveProgram(DEFAULT_SETTINGS, library)).toEqual(
      deriveProgram(DEFAULT_SETTINGS, library),
    )
  })

  it('changes when the settings change, with nothing to press', () => {
    // The failure this replaces: a setting moved in Settings and the
    // stored block went on prescribing the old shape until something
    // refreshed it — which, four separate mechanisms later, it still did
    // not.
    /*
     * **Exclusions, because they are the last setting the programme is
     * derived from.** This has now been three things: muscle volumes and
     * lift sessions, then days a week, and now the one input left. Each
     * became a constant in turn, and the property being tested never
     * changed — a setting moves and the next read is a different
     * programme, with nothing to press.
     */
    const before = deriveProgram(DEFAULT_SETTINGS, library)
    const after = deriveProgram(
      { ...DEFAULT_SETTINGS, excludedExercises: [asExerciseId('dips')] },
      library,
    )

    expect(after).not.toEqual(before)
  })

  it('honours an exclusion made in settings', () => {
    const without = deriveProgram(
      { ...DEFAULT_SETTINGS, excludedExercises: [asExerciseId('dips')] },
      library,
    )
    const ids = JSON.stringify(without)

    expect(ids).not.toContain('"dips"')
  })
})

describe('a position inside a program that changed shape', () => {
  it('is pulled back inside rather than left pointing past the end', () => {
    /*
     * A position past the end of the week, which the split can no longer
     * produce by shrinking — there is one split now. It is still reachable
     * from a stored position written by an older build, which is what
     * `clampPosition` exists for: a stale index past the last day would
     * otherwise show an empty session rather than a day.
     */
    const week = deriveProgram(DEFAULT_SETTINGS, library)
    const pastTheEnd = { ...start, weekIndex: 0, dayIndex: 9 }
    const lastDay = (week.blocks[0]?.weeks[0]?.days.length ?? 0) - 1

    const clamped = clampPosition(week, pastTheEnd)

    expect(clamped.dayIndex).toBe(lastDay)
    expect(
      week.blocks[clamped.blockIndex]?.weeks[clamped.weekIndex]?.days[clamped.dayIndex],
    ).toBeDefined()
  })

  it('clamps rather than resetting to week one', () => {
    // Being moved from Friday to Wednesday is a small surprise. Being
    // sent back to the start of the block is a lost month.
    const shorter = deriveProgram(DEFAULT_SETTINGS, library)
    const deepIn = { ...start, weekIndex: (shorter.blocks[0]?.weeks.length ?? 0) + 3, dayIndex: 0 }

    const clamped = clampPosition(shorter, deepIn)

    expect(clamped.weekIndex).toBeGreaterThan(0)
    expect(clamped.cycleNumber).toBe(1)
  })

  it('leaves a position that is already valid alone', () => {
    const program = deriveProgram(DEFAULT_SETTINGS, library)
    const middle = { ...start, weekIndex: 2, dayIndex: 1 }

    expect(clampPosition(program, middle)).toEqual(middle)
  })
})

describe('the shipped week', () => {
  const week = deriveProgram(DEFAULT_SETTINGS, library).blocks[0]?.weeks[0]
  const worked = (index: number): readonly string[] =>
    (week?.days[index]?.slots ?? [])
      .filter((slot) => slot.role !== 'warmup')
      .map((slot) => (slot.exercise.kind === 'specific' ? slot.exercise.exerciseId : ''))

  it('runs upper, legs, push, pull, legs, Monday to Friday', () => {
    expect(week?.days.map((day) => day.label)).toEqual([
      'Monday — Upper',
      'Tuesday — Legs A',
      'Wednesday — Push',
      'Thursday — Pull',
      'Friday — Legs B',
    ])
  })

  it('holds each routine exactly, in its written order', () => {
    expect(worked(0)).toEqual(['bench-press', 'pendlay-row', 'db-lateral-raise', 'barbell-shrug'])
    expect(worked(1)).toEqual([
      'low-bar-squat',
      'romanian-deadlift',
      'barbell-calf-raise',
      'ab-wheel',
    ])
    expect(worked(2)).toEqual(['overhead-press', 'dips', 'skullcrusher', 'french-press'])
    expect(worked(3)).toEqual(['pull-up', 'rear-delt-raise', 'ez-bar-curl', 'db-curl'])
    expect(worked(4)).toEqual([
      'sumo-deadlift',
      'front-squat',
      'barbell-calf-raise',
      'hanging-leg-raise',
    ])
  })

  /*
   * Every movement once a week except the calf raise, which runs on both
   * leg days in two ranges. A movement landing twice, or going missing,
   * would still build a valid week — this is what notices.
   */
  it('trains every movement once a week, the calf raise twice', () => {
    const all = [0, 1, 2, 3, 4].flatMap(worked)
    expect(all).toHaveLength(20)
    expect(all.filter((slug) => slug === 'barbell-calf-raise')).toHaveLength(2)
    expect(new Set(all).size).toBe(19)
  })

  /*
   * The two calf raises are told apart by variant, which is what keeps
   * their progression apart — see `workingLoads`.
   */
  it('runs the calf raise heavy on Legs A and light on Legs B', () => {
    const calf = (index: number) =>
      week?.days[index]?.slots.find(
        (slot) =>
          slot.exercise.kind === 'specific' && slot.exercise.exerciseId === 'barbell-calf-raise',
      )
    expect(calf(1)?.variant).toBe('Heavy')
    expect(calf(1)?.sets[0]?.reps).toEqual({ kind: 'range', low: 10, high: 20 })
    expect(calf(4)?.variant).toBe('Light')
    expect(calf(4)?.sets[0]?.reps).toEqual({ kind: 'range', low: 20, high: 30 })
  })

  it('keeps lateral raises off the press day and shrugs off the day before deadlifts', () => {
    expect(worked(2)).not.toContain('db-lateral-raise')
    expect(worked(3)).not.toContain('barbell-shrug')
  })

  it('runs each competition lift once, in its competition version', () => {
    const strength = (week?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'strength')
    expect(
      strength.map((slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId),
    ).toEqual(['bench-press', 'low-bar-squat', 'sumo-deadlift'])
  })

  it('prescribes four straight sets on everything lifted', () => {
    const lifted = (week?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role !== 'warmup' && slot.role !== 'conditioning')
    expect(lifted.every((slot) => slot.sets.length === 4)).toBe(true)
  })
})
