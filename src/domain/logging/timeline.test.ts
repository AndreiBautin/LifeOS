import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import type { LoggedSet } from '@/domain/logging/workout-log'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { sessionTimeline } from './timeline'

const at = (minutes: number) =>
  new Date(Date.parse('2026-06-01T09:00:00Z') + minutes * 60_000).toISOString()

const done = (minutes: number, isWarmup = false) =>
  aSet({ outcome: 'completed', completedAt: at(minutes), isWarmup, actualReps: 5 })

describe('where a session went', () => {
  const log = aWorkout({
    startedAt: at(0),
    completedAt: at(40),
    entries: [
      anEntry({ exerciseId: asExerciseId('foam-roll'), sets: [done(3, true)] }),
      anEntry({ exerciseId: asExerciseId('bench-press'), sets: [done(8), done(11), done(13)] }),
      anEntry({ exerciseId: asExerciseId('pendlay-row'), sets: [done(25), done(28)] }),
    ],
  })

  it('draws each exercise as a band from its first set to its last', () => {
    const timeline = sessionTimeline(log)
    expect(timeline?.length).toBe(40 * 60_000)
    expect(timeline?.bands.map((band) => [band.from / 60_000, band.to / 60_000])).toEqual([
      [3, 3],
      [8, 13],
      [25, 28],
    ])
  })

  /*
   * The twelve minutes between the last bench set and the first row are
   * a change of station, not rest, and must not count as either.
   */
  it('measures rest between sets of one exercise only', () => {
    const timeline = sessionTimeline(log)
    // Rests of 3, 2 and 3 minutes; the warm-up and the 12-minute changeover are out.
    expect(timeline?.medianRest).toBe(3 * 60_000)
    expect(timeline?.longestRest).toBe(3 * 60_000)
  })

  it('has nothing to draw without two different set times', () => {
    // A set with no stamp at all: the builder stamps one by default.
    const unstamped = (): LoggedSet => {
      const set: Omit<LoggedSet, 'completedAt'> & { completedAt?: string } = {
        ...aSet({ outcome: 'completed' }),
      }
      delete set.completedAt
      return set
    }
    expect(
      sessionTimeline(aWorkout({ entries: [anEntry({ sets: [unstamped(), unstamped()] })] })),
    ).toBeUndefined()
    // Filed in one go: every set at the same instant.
    expect(
      sessionTimeline(aWorkout({ entries: [anEntry({ sets: [done(5), done(5), done(5)] })] })),
    ).toBeUndefined()
  })
})
