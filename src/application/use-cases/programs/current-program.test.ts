import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import { nextPosition, STARTING_POSITION } from '@/domain/programs/position'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { clampPosition, dayAt, deriveProgram } from './current-program'

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
    expect(dayAt(week, clamped)).toBeDefined()
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

describe('advancing', () => {
  const program = deriveProgram(DEFAULT_SETTINGS, library)

  it('moves a day at a time, then a week', () => {
    let position = start
    const week = program.blocks[0]?.weeks[0]
    if (week === undefined) throw new Error('expected a week')

    for (let day = 1; day < week.days.length; day += 1) {
      const result = nextPosition(program, position)
      if (result.kind !== 'moved') throw new Error('expected to move')
      position = result.position
      expect(position.dayIndex).toBe(day)
    }

    const rollover = nextPosition(program, position)
    if (rollover.kind !== 'moved') throw new Error('expected to move')
    expect(rollover.position.weekIndex).toBe(1)
    expect(rollover.position.dayIndex).toBe(0)
  })

  it('starts the block again rather than finishing', () => {
    // There is no "program finished" state. A block that ends used to
    // leave the lifter on a screen saying so, with a library to go and
    // pick from — and there is no library. Training continues.
    const block = program.blocks[0]
    if (block === undefined) throw new Error('expected a block')

    const lastWeek = block.weeks.length - 1
    const lastDay = (block.weeks[lastWeek]?.days.length ?? 1) - 1
    const atEnd = { ...start, weekIndex: lastWeek, dayIndex: lastDay }

    const result = nextPosition(program, atEnd)

    expect(result.kind).toBe('cycled')
    if (result.kind !== 'cycled') throw new Error('expected to cycle')
    expect(result.position.cycleNumber).toBe(2)
    expect(result.position.weekIndex).toBe(0)
    expect(result.position.dayIndex).toBe(0)
  })
})

/**
 * The week the app ships is the lifter's own routine, taken as written.
 *
 * Asserted exercise by exercise because the failure worth catching is
 * quiet: a generated fill swapping one movement for another, or two lines
 * trading places, would still build a perfectly valid week.
 */
describe('the shipped week', () => {
  const week = deriveProgram(DEFAULT_SETTINGS, library).blocks[0]?.weeks[0]
  const worked = (index: number): readonly string[] =>
    (week?.days[index]?.slots ?? [])
      .filter((slot) => slot.role !== 'warmup')
      .map((slot) => (slot.exercise.kind === 'specific' ? slot.exercise.exerciseId : ''))

  it('runs the A days then the B days, Monday to Saturday', () => {
    expect(week?.days.map((day) => day.label)).toEqual([
      'Monday — Push A',
      'Tuesday — Pull A',
      'Wednesday — Legs A',
      'Thursday — Push B',
      'Friday — Pull B',
      'Saturday — Legs B',
    ])
  })

  it('holds each routine exactly, in its written order', () => {
    expect(worked(0)).toEqual(['overhead-press', 'dips', 'skullcrusher'])
    expect(worked(1)).toEqual(['pendlay-row', 'barbell-shrug', 'ez-bar-curl'])
    expect(worked(2)).toEqual(['low-bar-squat', 'kb-swing', 'ab-wheel'])
    expect(worked(3)).toEqual(['bench-press', 'db-lateral-raise', 'french-press'])
    expect(worked(4)).toEqual(['pull-up', 'rear-delt-raise', 'db-curl'])
    expect(worked(5)).toEqual(['sumo-deadlift', 'barbell-calf-raise', 'hanging-leg-raise'])
  })

  /*
   * Each pair is split across its A and B day, so the week holds every
   * movement exactly once. A pair landing on the same day, or one side
   * going missing, would still build a valid week — this is what notices.
   */
  it('trains every movement exactly once a week', () => {
    const all = [0, 1, 2, 3, 4, 5].flatMap(worked)
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(18)
  })

  it('runs each competition lift once, in its competition version', () => {
    const strength = (week?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'strength')
    expect(
      strength.map((slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId),
    ).toEqual(['low-bar-squat', 'bench-press', 'sumo-deadlift'])
  })

  it('prescribes three straight sets on everything lifted', () => {
    const lifted = (week?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role !== 'warmup' && slot.role !== 'conditioning')
    expect(lifted.every((slot) => slot.sets.length === 3)).toBe(true)
  })
})
