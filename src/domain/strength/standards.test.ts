import { describe, expect, it } from 'vitest'

import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'

import { strengthStandings, TOTAL_STANDARDS } from './standards'

const maxes = (squat?: number, bench?: number, deadlift?: number) => ({
  ...(squat === undefined ? {} : { [asExerciseId(STRENGTH_LIFT_SLUGS.squat)]: squat }),
  ...(bench === undefined ? {} : { [asExerciseId(STRENGTH_LIFT_SLUGS.bench)]: bench }),
  ...(deadlift === undefined ? {} : { [asExerciseId(STRENGTH_LIFT_SLUGS.deadlift)]: deadlift }),
})

describe('strength against the published standards', () => {
  it('states each lift as a multiple of bodyweight', () => {
    const { lifts } = strengthStandings({ estimatedMaxes: maxes(300, 200, 400), bodyweight: 200 })

    expect(lifts.map((lift) => lift.multiple)).toEqual([1.5, 1, 2])
  })

  /*
   * The next standard is the first one strictly above — a lifter sitting
   * exactly on 1.5× has reached it, so the target is the one after.
   */
  it('names the next multiple above and the load that reaches it', () => {
    const { lifts } = strengthStandings({ estimatedMaxes: maxes(300), bodyweight: 200 })

    expect(lifts[0]?.next).toEqual({ multiple: 2.25, load: 450 })
  })

  it('rounds the target load up to something loadable', () => {
    const { lifts } = strengthStandings({ estimatedMaxes: maxes(300), bodyweight: 183 })

    // 2.25 × 183 = 411.75, rounded up to the next five.
    expect(lifts[0]?.next?.load).toBe(415)
  })

  it('names no next standard past the top one', () => {
    const { lifts } = strengthStandings({ estimatedMaxes: maxes(600), bodyweight: 200 })

    expect(lifts[0]?.next).toBeUndefined()
  })

  it('keeps the max but claims no multiple without a bodyweight', () => {
    const { lifts } = strengthStandings({ estimatedMaxes: maxes(300) })

    expect(lifts[0]?.max).toBe(300)
    expect(lifts[0]?.multiple).toBeUndefined()
  })

  it('totals only when every lift has a max', () => {
    const partial = strengthStandings({ estimatedMaxes: maxes(300, 200), bodyweight: 200 })
    const whole = strengthStandings({ estimatedMaxes: maxes(300, 200, 400), bodyweight: 200 })

    expect(partial.total.max).toBeUndefined()
    expect(whole.total.max).toBe(900)
    expect(whole.total.multiple).toBe(4.5)
  })

  it('sums the total standards from the three lifts', () => {
    expect(TOTAL_STANDARDS).toEqual([2.25, 3.5, 4.75, 6.5, 7.75])
  })
})
