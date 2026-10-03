import { describe, expect, it } from 'vitest'

import { REST_SECONDS, restAfter, SHORT_SET_EXTRA_SECONDS } from './rest'

const heavy = { role: 'strength', isCompound: true } as const
const compound = { role: 'hypertrophy', isCompound: true } as const
const isolation = { role: 'hypertrophy', isCompound: false } as const

describe('rest after a set', () => {
  it('fits the work: longest after a heavy lift, shortest after isolation', () => {
    const after = (work: typeof heavy | typeof compound | typeof isolation) =>
      restAfter({ work, lastOfExercise: false }).seconds
    expect(after(heavy)).toBe(REST_SECONDS.heavy)
    expect(after(compound)).toBe(REST_SECONDS.compound)
    expect(after(isolation)).toBe(REST_SECONDS.isolation)
  })

  /* Two minutes after the last curl leads into a squat; the squat decides. */
  it('rests the last set of an exercise for the one coming next', () => {
    const plan = restAfter({ work: isolation, next: heavy, lastOfExercise: true })
    expect(plan.seconds).toBe(REST_SECONDS.heavy)
    expect(plan.reason).toBe('Heavy lift')
  })

  it('adds time after a set that fell short of its plan, and says so', () => {
    const plan = restAfter({ work: compound, lastOfExercise: false, plannedReps: 8, doneReps: 6 })
    expect(plan.seconds).toBe(REST_SECONDS.compound + SHORT_SET_EXTRA_SECONDS)
    expect(plan.reason).toBe('Short set')
  })

  it('starts no timer before conditioning or after the last thing in the session', () => {
    const walk = { role: 'conditioning', isCompound: false } as const
    expect(restAfter({ work: isolation, next: walk, lastOfExercise: true }).seconds).toBe(0)
    expect(restAfter({ work: isolation, lastOfExercise: true }).seconds).toBe(0)
  })

  it("honours an exercise's own rest", () => {
    expect(
      restAfter({ work: { ...isolation, restSeconds: 60 }, lastOfExercise: false }).seconds,
    ).toBe(60)
  })
})
