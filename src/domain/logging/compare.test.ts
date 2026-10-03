import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { compareSessions } from './compare'

const BENCH = asExerciseId('bench-press')
const DIPS = asExerciseId('dips')
const ROW = asExerciseId('barbell-row')

describe('two sessions side by side', () => {
  const before = aWorkout({
    entries: [
      anEntry({ exerciseId: BENCH, sets: [aSet({ actualLoad: 200, actualReps: 5 })] }),
      anEntry({ exerciseId: ROW, sets: [aSet({ actualLoad: 135, actualReps: 8 })] }),
    ],
  })
  const now = aWorkout({
    entries: [
      anEntry({
        exerciseId: BENCH,
        sets: [aSet({ actualLoad: 205, actualReps: 5 }), aSet({ actualLoad: 205, actualReps: 4 })],
      }),
      anEntry({ exerciseId: DIPS, sets: [aSet({ actualLoad: 0, actualReps: 12 })] }),
    ],
  })
  const rows = compareSessions(now, before)

  it('sums each side’s volume and judges the top sets by the usual rule', () => {
    const bench = rows.find((row) => row.exerciseId === BENCH)
    expect(bench?.here?.volume).toBe(205 * 9)
    expect(bench?.there?.volume).toBe(1000)
    expect(bench?.versus?.kind).toBe('heavier')
  })

  it('finds the top set of a day version too', () => {
    const light = (load: number) =>
      aWorkout({
        entries: [
          anEntry({
            exerciseId: ROW,
            variant: 'Light',
            sets: [aSet({ actualLoad: load, actualReps: 25 })],
          }),
        ],
      })
    const [calf] = compareSessions(light(150), light(145))
    expect(calf?.here?.top?.load).toBe(150)
    expect(calf?.versus?.kind).toBe('heavier')
  })

  it("keeps this session's order, then what only the other had", () => {
    expect(rows.map((row) => row.exerciseId)).toEqual([BENCH, DIPS, ROW])
    expect(rows.find((row) => row.exerciseId === ROW)?.here).toBeUndefined()
    expect(rows.find((row) => row.exerciseId === DIPS)?.there).toBeUndefined()
  })
})
