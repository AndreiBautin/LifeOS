import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { blockReport, blockWindow } from './block'

const BENCH = asExerciseId('bench-press')
const SQUAT = asExerciseId('squat')
const PULLUP = asExerciseId('pull-up')

describe('the block a day falls in', () => {
  it('cuts whole weeks since the anchor into runs of the program', () => {
    // Anchored Monday Aug 3, seven-week block; Oct 3 is in week 9, so block two.
    expect(blockWindow('2026-08-05', 7, '2026-10-03')).toEqual({
      start: '2026-09-21',
      end: '2026-11-08',
      weeks: 7,
    })
    expect(blockWindow('2026-08-05', 7, '2026-10-03', 1).start).toBe('2026-08-03')
  })

  it('reads a day before the anchor as the first block', () => {
    expect(blockWindow('2026-08-03', 4, '2026-07-01').start).toBe('2026-08-03')
  })
})

describe('a block, start to finish', () => {
  const window = { start: '2026-09-21', end: '2026-10-04', weeks: 2 }
  const day = (id: string, date: string, bench: number, squat?: number) =>
    aWorkout({
      id: asWorkoutId(id),
      date,
      entries: [
        anEntry({
          exerciseId: BENCH,
          sets: [
            aSet({ actualLoad: bench, actualReps: 5 }),
            aSet({ actualLoad: bench - 20, actualReps: 8 }),
            aSet({ isWarmup: true, actualLoad: bench + 100, actualReps: 1 }),
          ],
        }),
        ...(squat === undefined
          ? []
          : [anEntry({ exerciseId: SQUAT, sets: [aSet({ actualLoad: squat, actualReps: 3 })] })]),
        anEntry({ exerciseId: PULLUP, sets: [aSet({ actualLoad: 0, actualReps: 12 })] }),
      ],
    })
  const report = blockReport(
    [
      day('before', '2026-09-14', 150),
      day('a', '2026-09-22', 200, 300),
      day('b', '2026-09-29', 210),
      day('after', '2026-10-06', 230, 340),
    ],
    window,
    '2026-10-10',
  )

  it('counts only the sessions inside the block', () => {
    expect(report.sessions).toBe(2)
    expect(report.perWeek).toEqual([4, 3])
  })

  it('moves an exercise from its first top set in the block to its last', () => {
    expect(report.lifts[0]).toMatchObject({
      exerciseId: BENCH,
      from: { load: 200, reps: 5 },
      to: { load: 210, reps: 5 },
    })
    expect(report.lifts[0]?.change).toBeCloseTo(0.05)
  })

  /* One squat session is not a change; an unloaded pull-up has no bar to move. */
  it('leaves out a single session and a movement with no load', () => {
    expect(report.lifts.map((lift) => lift.exerciseId)).toEqual([BENCH])
  })

  /* A light calf raise after a heavy one is not the lift going down. */
  it('keeps a day version as its own line', () => {
    const calf = asExerciseId('barbell-calf-raise')
    const session = (date: string, variant: string, load: number) =>
      aWorkout({
        date,
        entries: [
          anEntry({
            exerciseId: calf,
            variant,
            sets: [aSet({ actualLoad: load, actualReps: 15 })],
          }),
        ],
      })
    const lifts = blockReport(
      [
        session('2026-09-22', 'Heavy', 200),
        session('2026-09-25', 'Light', 140),
        session('2026-09-29', 'Heavy', 210),
        session('2026-10-02', 'Light', 145),
      ],
      window,
      '2026-10-10',
    ).lifts
    expect(lifts.map((lift) => [lift.version, lift.from.load, lift.to.load])).toEqual([
      ['Heavy', 200, 210],
      ['Light', 140, 145],
    ])
  })

  it('counts through today while the block is still running', () => {
    expect(blockReport([], window, '2026-09-25').through).toBe('2026-09-25')
  })
})
