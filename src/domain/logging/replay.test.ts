import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { frameAt, replayFrames } from './replay'

const BENCH = asExerciseId('bench-press')
const ROW = asExerciseId('barbell-row')
const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 18, minutes)).toISOString()

describe('replaying a session', () => {
  const log = aWorkout({
    startedAt: at(0),
    entries: [
      anEntry({
        exerciseId: BENCH,
        sets: [
          aSet({ isWarmup: true, actualLoad: 45, actualReps: 10, completedAt: at(2) }),
          aSet({ actualLoad: 215, actualReps: 3, completedAt: at(5) }),
          aSet({ actualLoad: 215, actualReps: 3, completedAt: at(9) }),
          aSet({ outcome: 'skipped' }),
        ],
      }),
      anEntry({
        exerciseId: ROW,
        sets: [aSet({ actualLoad: 155, actualReps: 8, completedAt: at(7) })],
      }),
    ],
  })
  const frames = replayFrames(log)

  it('places every stamped set in the order it happened', () => {
    expect(frames.map((frame) => [frame.at / 60_000, frame.exerciseId, frame.setNumber])).toEqual([
      [2, BENCH, undefined],
      [5, BENCH, 1],
      [7, ROW, 1],
      [9, BENCH, 2],
    ])
  })

  it('shows the last set logged at or before a moment', () => {
    expect(frameAt(frames, 6 * 60_000)?.load).toBe(215)
    expect(frameAt(frames, 7 * 60_000)?.exerciseId).toBe(ROW)
    expect(frameAt(frames, 60_000)).toBeUndefined()
  })

  /* Filed in one go is not a session that unfolded. */
  it('has nothing to replay when every set shares one time', () => {
    const filed = aWorkout({
      startedAt: at(0),
      entries: [
        anEntry({
          exerciseId: BENCH,
          sets: [aSet({ completedAt: at(30) }), aSet({ completedAt: at(30) })],
        }),
      ],
    })
    expect(replayFrames(filed)).toEqual([])
  })
})
