import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramPosition } from '@/domain/programs/position'
import { blockStartFor, sessionFrom, sessionOn, slotOn } from '@/domain/programs/schedule'
import type { Clock } from '@/domain/repositories/ports'
import { shiftDay } from '@/domain/time/day'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { aWorkout } from '@/test/builders/workout'

import { deriveProgram } from './current-program'
import { blockStartOf, scheduleFor, type ScheduleDeps } from './schedule'

const program = deriveProgram(DEFAULT_SETTINGS, builtInExercises())
const weeks = program.blocks.reduce((sum, block) => sum + block.weeks.length, 0)

// Monday 5 January 2026 begins the block in most of these.
const BLOCK = '2026-01-05'

describe('the day comes from the date', () => {
  it.each([
    ['2026-01-05', 'Monday — Upper'],
    ['2026-01-06', 'Tuesday — Legs A'],
    ['2026-01-07', 'Wednesday — Push'],
    ['2026-01-08', 'Thursday — Pull'],
    ['2026-01-09', 'Friday — Legs B'],
  ])('%s is %s', (on, label) => {
    expect(sessionOn(program, BLOCK, on)?.day.label).toBe(label)
  })

  it('has nothing on the weekend', () => {
    expect(sessionOn(program, BLOCK, '2026-01-10')).toBeUndefined()
    expect(sessionOn(program, BLOCK, '2026-01-11')).toBeUndefined()
  })

  /*
   * The whole point of the change. A queue held Legs A over to the
   * Wednesday when the Tuesday was missed, and every day after it slid
   * one place later than the routine says.
   */
  it('does not hold a missed day over: Wednesday is Push whatever Tuesday did', () => {
    expect(sessionOn(program, BLOCK, '2026-01-14')?.day.label).toBe('Wednesday — Push')
  })

  it('offers Monday’s session from a Sunday', () => {
    const next = sessionFrom(program, BLOCK, '2026-01-11')
    expect(next?.on).toBe('2026-01-12')
    expect(next?.day.label).toBe('Monday — Upper')
  })
})

describe('the week comes from whole weeks since the block began', () => {
  it('counts weeks, deloads last, then starts the next cycle', () => {
    expect(slotOn(program, BLOCK, '2026-01-09')).toEqual({
      cycleNumber: 1,
      blockIndex: 0,
      weekIndex: 0,
    })
    expect(slotOn(program, BLOCK, '2026-01-14')?.weekIndex).toBe(1)

    const lastWeek = weeks - 1
    const intoDeload = slotOn(program, BLOCK, shiftDay(BLOCK, lastWeek * 7))
    expect(intoDeload?.weekIndex).toBe(lastWeek)
    expect(program.blocks[0]?.weeks[lastWeek]?.isDeload).toBe(true)

    expect(slotOn(program, BLOCK, shiftDay(BLOCK, weeks * 7))).toEqual({
      cycleNumber: 2,
      blockIndex: 0,
      weekIndex: 0,
    })
  })

  it('puts a date in the week a block start was chosen for', () => {
    const started = blockStartFor(
      program,
      { cycleNumber: 1, blockIndex: 0, weekIndex: 3 },
      '2026-03-04',
    )
    expect(slotOn(program, started, '2026-03-04')?.weekIndex).toBe(3)
    expect(slotOn(program, started, '2026-03-09')?.weekIndex).toBe(4)
  })
})

describe('reading a position written by the cursor', () => {
  /*
   * The device this replaced on stood at week six, day five, last moved
   * on Thursday 1 October 2026. It must read as week six the same week —
   * not week one — or the change costs the lifter their block.
   */
  it('keeps the lifter in the week the cursor pointed at', () => {
    const cursor: ProgramPosition = {
      cycleNumber: 1,
      blockIndex: 0,
      weekIndex: 5,
      dayIndex: 4,
      startedAt: '2026-09-30T21:52:33.337Z',
      updatedAt: '2026-10-01T22:28:24.273Z',
    }

    const started = blockStartOf(program, cursor, '2026-10-02')
    expect(started).toBe('2026-08-24')
    expect(slotOn(program, started, '2026-10-02')?.weekIndex).toBe(5)
    expect(sessionOn(program, started, '2026-10-02')?.day.label).toBe('Friday — Legs B')
  })

  it('prefers a stated block start over the cursor fields', () => {
    const stated: ProgramPosition = {
      cycleNumber: 1,
      blockIndex: 0,
      weekIndex: 5,
      dayIndex: 4,
      startedAt: '2026-01-01T00:00:00.000Z',
      blockStartedOn: '2026-09-28',
    }
    expect(blockStartOf(program, stated, '2026-10-02')).toBe('2026-09-28')
  })

  it('starts a device with nothing stored on this week', () => {
    expect(blockStartOf(program, undefined, '2026-10-02')).toBe('2026-09-28')
  })
})

describe('the schedule for today', () => {
  function deps(logs: readonly WorkoutLog[], now: Date, stored?: ProgramPosition): ScheduleDeps {
    const clock: Clock = { now: () => now }
    return {
      position: { get: () => Promise.resolve(stored) },
      workouts: { recent: () => Promise.resolve(logs) },
      clock,
    } as unknown as ScheduleDeps
  }

  // Tuesday 6 January 2026, midday in New York.
  const TUESDAY = new Date('2026-01-06T17:00:00Z')
  const stored = {
    cycleNumber: 1,
    blockIndex: 0,
    weekIndex: 0,
    dayIndex: 0,
    startedAt: '2026-01-05T00:00:00.000Z',
    blockStartedOn: BLOCK,
  }

  it('offers today’s session until it is done', async () => {
    const schedule = await scheduleFor(program, deps([], TUESDAY, stored))
    expect(schedule.doneToday).toBe(false)
    expect(schedule.next?.day.label).toBe('Tuesday — Legs A')
    expect(schedule.next?.on).toBe('2026-01-06')
  })

  it('moves on to tomorrow once today’s session is finished', async () => {
    const finished = aWorkout({
      date: '2026-01-06',
      status: 'completed',
      position: { cycleNumber: 1, blockIndex: 0, weekIndex: 0, dayIndex: 1 },
    })
    const schedule = await scheduleFor(program, deps([finished], TUESDAY, stored))
    expect(schedule.doneToday).toBe(true)
    expect(schedule.next?.day.label).toBe('Wednesday — Push')
  })

  /*
   * An open session from scratch on a Tuesday is not the Tuesday session,
   * so it must not mark the day done and hide Legs A.
   */
  it('does not count a session from scratch as today’s', async () => {
    const freestyle = aWorkout({ date: '2026-01-06', status: 'completed' })
    const schedule = await scheduleFor(program, deps([freestyle], TUESDAY, stored))
    expect(schedule.doneToday).toBe(false)
  })
})
