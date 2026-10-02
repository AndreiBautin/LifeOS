import { describe, expect, it } from 'vitest'

import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { Clock } from '@/domain/repositories/ports'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { mondayOf, weekSummary, type WeekDeps } from './week'

function harness(workouts: readonly WorkoutLog[], now: Date): WeekDeps {
  const clock: Clock = { now: () => now }
  return {
    workouts: { recent: () => Promise.resolve(workouts) },
    exercises: { all: () => Promise.resolve([]) },
    clock,
  } as unknown as WeekDeps
}

function trained(day: string, sets = 3, status: WorkoutLog['status'] = 'completed'): WorkoutLog {
  return aWorkout({
    date: day,
    status,
    entries: [anEntry({ sets: Array.from({ length: sets }, () => aSet()) })],
  })
}

// Wednesday 21 January 2026, midday in New York.
const WEDNESDAY = new Date('2026-01-21T17:00:00Z')

describe('mondayOf', () => {
  it('finds the Monday of the week, Sunday belonging to the week before it', () => {
    expect(mondayOf('2026-01-21')).toBe('2026-01-19')
    expect(mondayOf('2026-01-19')).toBe('2026-01-19')
    expect(mondayOf('2026-01-25')).toBe('2026-01-19')
  })
})

describe('the week so far', () => {
  /*
   * A rolling window would count last Saturday as "this week" on a
   * Wednesday, which is what the screen used to do: the bars were judged
   * against a Monday-to-Saturday plan with a different week's work.
   */
  it('counts from Monday, not the last seven days', async () => {
    const week = await weekSummary(
      harness(
        [trained('2026-01-17', 4), trained('2026-01-19', 5), trained('2026-01-20', 2)],
        WEDNESDAY,
      ),
    )

    expect(week.monday).toBe('2026-01-19')
    expect(week.sessions).toBe(2)
    expect(week.sets).toBe(7)
  })

  it('leaves abandoned sessions out, as the training grid does', async () => {
    const week = await weekSummary(
      harness([trained('2026-01-19', 5), trained('2026-01-20', 2, 'abandoned')], WEDNESDAY),
    )

    expect(week.sessions).toBe(1)
    expect(week.sets).toBe(5)
  })
})

describe('the streak', () => {
  it('counts consecutive weeks that had a session', async () => {
    const week = await weekSummary(
      harness(
        [
          trained('2026-01-20'),
          trained('2026-01-13'),
          trained('2026-01-06'),
          trained('2025-12-22'),
        ],
        WEDNESDAY,
      ),
    )

    // This week, the 12th and the 5th; the week of the 29th was missed.
    expect(week.streakWeeks).toBe(3)
  })

  /*
   * The humane rule streaks follow everywhere: a week you have not
   * finished cannot break a run. Opening the app on a Monday morning must
   * not report a ten-week streak as over.
   */
  it('does not break on a week that has not had its session yet', async () => {
    const week = await weekSummary(
      harness([trained('2026-01-13'), trained('2026-01-06')], WEDNESDAY),
    )

    expect(week.sessions).toBe(0)
    expect(week.streakWeeks).toBe(2)
  })

  it('is nought with nothing logged', async () => {
    expect((await weekSummary(harness([], WEDNESDAY))).streakWeeks).toBe(0)
  })
})
