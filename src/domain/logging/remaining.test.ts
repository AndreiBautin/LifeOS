import { describe, expect, it } from 'vitest'

import { REST_SECONDS } from '@/domain/programs/rest'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { remainingSeconds } from './remaining'

const fiveReps = { load: { kind: 'open' }, reps: { kind: 'fixed', reps: 5 } } as const

describe('what is left of a session', () => {
  const pending = aSet({ outcome: 'pending', prescription: fiveReps })
  const done = aSet({ prescription: fiveReps })

  it('costs only the pending sets, each with the rest the timer will give it', () => {
    const workout = aWorkout({
      entries: [anEntry({ role: 'strength', sets: [done, pending, pending] })],
    })
    const left = remainingSeconds(workout, () => ({ role: 'strength', isCompound: true }))
    // Two sets of five reps, three seconds a rep, plus a heavy lift's rest each.
    expect(left).toBe(2 * (15 + REST_SECONDS.heavy))
  })

  it('is nothing once every set is settled', () => {
    const workout = aWorkout({ entries: [anEntry({ sets: [done] })] })
    expect(remainingSeconds(workout, () => ({ role: 'strength', isCompound: true }))).toBe(0)
  })
})
