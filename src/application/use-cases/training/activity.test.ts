import { describe, expect, it } from 'vitest'

import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { Clock } from '@/domain/repositories/ports'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { activityFor, type ActivityDeps } from './activity'

function harness(workouts: readonly WorkoutLog[], now: Date): ActivityDeps {
  const clock: Clock = { now: () => now }
  return { workouts: { recent: () => Promise.resolve(workouts) }, clock } as unknown as ActivityDeps
}

/** A finished session holding `sets` completed working sets. */
function trained(day: string, sets = 3, status: WorkoutLog['status'] = 'completed'): WorkoutLog {
  return aWorkout({
    date: day,
    status,
    entries: [anEntry({ sets: Array.from({ length: sets }, () => aSet()) })],
  })
}

// A Wednesday, at noon local time.
const NOW = new Date('2026-01-21T17:00:00Z')

describe('the training grid', () => {
  it('puts each day’s working sets on that day', async () => {
    const activity = await activityFor(
      harness([trained('2026-01-19', 4), trained('2026-01-19', 2), trained('2026-01-20', 5)], NOW),
      1,
    )

    const days = activity.weeks.flat()
    expect(days.find((one) => one.day === '2026-01-19')?.sets).toBe(6)
    expect(days.find((one) => one.day === '2026-01-20')?.sets).toBe(5)
    expect(activity.sessions).toBe(3)
    expect(activity.sets).toBe(11)
  })

  /*
   * An abandoned session is work inside a session walked away from, and
   * the history screen already counts it apart. The grid is a picture of
   * training done, so it reads finished sessions only.
   */
  it('leaves out sessions that were not finished', async () => {
    const activity = await activityFor(harness([trained('2026-01-19', 4, 'abandoned')], NOW), 1)

    expect(activity.sessions).toBe(0)
    expect(activity.weeks.flat().every((one) => one.sets === 0)).toBe(true)
  })

  it('counts nothing from before the window it draws', async () => {
    const activity = await activityFor(harness([trained('2025-06-01', 4)], NOW), 2)

    expect(activity.sessions).toBe(0)
  })

  it('runs Monday to Sunday and leaves the rest of this week empty', async () => {
    const activity = await activityFor(harness([], NOW), 2)
    const thisWeek = activity.weeks[1] ?? []

    expect(thisWeek[0]?.day).toBe('2026-01-19')
    expect(thisWeek.filter((one) => one.future).map((one) => one.day)).toEqual([
      '2026-01-22',
      '2026-01-23',
      '2026-01-24',
      '2026-01-25',
    ])
  })
})
