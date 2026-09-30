import { describe, expect, it } from 'vitest'

import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { LogEntry, WorkoutLog } from '@/domain/logging/workout-log'

import { strengthTrend } from './trend'

function entry(slug: string, load: number, reps: number): LogEntry {
  return {
    exerciseId: slug as ExerciseId,
    role: 'strength',
    order: 0,
    sets: [
      {
        prescription: { load: { kind: 'working' }, reps: { kind: 'range', low: 3, high: 5 } },
        plannedLoad: load,
        plannedReps: reps,
        actualLoad: load,
        actualReps: reps,
        outcome: 'completed',
        isWarmup: false,
      },
    ],
  }
}

function log(
  date: string,
  entries: LogEntry[],
  status: WorkoutLog['status'] = 'completed',
): WorkoutLog {
  return {
    id: date as WorkoutId,
    date,
    startedAt: `${date}T10:00:00.000Z`,
    status,
    title: 'x',
    entries,
  }
}

describe('the strength trend', () => {
  it('plots each lift in date order, however the logs arrive', () => {
    const trend = strengthTrend([
      log('2026-09-10', [entry('low-bar-squat', 245, 5)]),
      log('2026-09-01', [entry('low-bar-squat', 235, 5)]),
    ])

    expect(trend.squat.map((point) => point.date)).toEqual(['2026-09-01', '2026-09-10'])
    expect(trend.squat[1]?.value).toBeGreaterThan(trend.squat[0]?.value ?? Infinity)
    expect(trend.bench).toEqual([])
  })

  /*
   * The report never read an abandoned session, and a set of twenty is
   * outside what the formula was fitted for — plotting either would put
   * a point on the line the app never stood behind.
   */
  it('leaves out abandoned sessions and unreliable estimates', () => {
    const trend = strengthTrend([
      log('2026-09-01', [entry('bench-press', 185, 5)], 'abandoned'),
      log('2026-09-03', [entry('bench-press', 95, 20)]),
      log('2026-09-05', [entry('bench-press', 190, 5)]),
    ])

    expect(trend.bench.map((point) => point.date)).toEqual(['2026-09-05'])
  })
})
