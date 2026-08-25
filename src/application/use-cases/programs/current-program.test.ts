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
    // The failure this replaces: a tier moved in Settings and the stored
    // block went on prescribing the old shape until something refreshed
    // it — which, four separate mechanisms later, it still did not.
    const before = deriveProgram(DEFAULT_SETTINGS, library)
    const after = deriveProgram(
      {
        ...DEFAULT_SETTINGS,
        muscleTiers: [
          { rank: 1, members: ['chest'], label: 'Specialising' },
          { rank: 2, members: ['lats'], label: 'Building' },
          { rank: 3, members: ['biceps'], label: 'Maintaining' },
        ],
      },
      library,
    )

    expect(after).not.toEqual(before)
    expect(after.name).toBe('Chest · Bench press strength')
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
    // Dropping from five days a week to three leaves a Friday position
    // pointing at nothing, and the Train screen would show an empty
    // session rather than a day.
    const threeDay = deriveProgram({ ...DEFAULT_SETTINGS, daysPerWeek: 3 }, library)
    const onFriday = { ...start, weekIndex: 0, dayIndex: 4 }

    const clamped = clampPosition(threeDay, onFriday)

    expect(clamped.dayIndex).toBe(2)
    expect(dayAt(threeDay, clamped)).toBeDefined()
  })

  it('clamps rather than resetting to week one', () => {
    // Being moved from Friday to Wednesday is a small surprise. Being
    // sent back to the start of the block is a lost month.
    const shorter = deriveProgram({ ...DEFAULT_SETTINGS, weeksBeforeDeload: 4 }, library)
    const deepIn = { ...start, weekIndex: 7, dayIndex: 0 }

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
