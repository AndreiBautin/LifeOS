import { describe, expect, it } from 'vitest'

import { asWorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { WorkoutRepository } from '@/domain/repositories/ports'
import { aWorkout } from '@/test/builders/workout'

import { NOTE_LIMIT, noteWorkout } from './note-workout'

function harness(log: WorkoutLog) {
  let saved = log
  const workouts = {
    byId: () => Promise.resolve(saved),
    save: (next: WorkoutLog) => {
      saved = next
      return Promise.resolve()
    },
  } as unknown as WorkoutRepository
  return { deps: { workouts }, saved: () => saved }
}

describe('a session note', () => {
  const id = asWorkoutId('w')

  it('is kept trimmed', async () => {
    const { deps, saved } = harness(aWorkout({ id }))
    await noteWorkout(id, '  slept four hours  ', deps)
    expect(saved().notes).toBe('slept four hours')
  })

  it('is removed, not stored empty, when cleared', async () => {
    const { deps, saved } = harness(aWorkout({ id, notes: 'old' }))
    await noteWorkout(id, '   ', deps)
    expect('notes' in saved()).toBe(false)
  })

  it('is a line, not a journal', async () => {
    const { deps, saved } = harness(aWorkout({ id }))
    await noteWorkout(id, 'x'.repeat(NOTE_LIMIT + 50), deps)
    expect(saved().notes).toHaveLength(NOTE_LIMIT)
  })
})
