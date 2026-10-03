import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { dayNameOf, filterHistory, NO_FILTER } from './history-filter'

const names: Record<string, string> = { 'front-squat': 'Front Squat', 'bench-press': 'Bench Press' }
const nameOf = (id: string) => names[id] ?? id

const legs = aWorkout({
  id: asWorkoutId('legs'),
  title: 'Friday — Legs B',
  notes: 'Left knee sore',
  entries: [anEntry({ exerciseId: asExerciseId('front-squat') })],
})
const upper = aWorkout({
  id: asWorkoutId('upper'),
  title: 'Monday — Upper',
  entries: [
    anEntry({ exerciseId: asExerciseId('bench-press'), sets: [aSet({ notes: 'paused' })] }),
    // On the plan and never done: not something this session "had".
    anEntry({ exerciseId: asExerciseId('front-squat'), sets: [aSet({ outcome: 'skipped' })] }),
  ],
})
const logs = [legs, upper]
const none = () => 0

describe('finding a session', () => {
  it('matches the day, an exercise done, or a note, whatever the case', () => {
    expect(filterHistory(logs, { ...NO_FILTER, query: 'legs b' }, nameOf, none)).toEqual([legs])
    expect(filterHistory(logs, { ...NO_FILTER, query: 'FRONT squat' }, nameOf, none)).toEqual([
      legs,
    ])
    expect(filterHistory(logs, { ...NO_FILTER, query: 'knee' }, nameOf, none)).toEqual([legs])
    expect(filterHistory(logs, { ...NO_FILTER, query: 'paused' }, nameOf, none)).toEqual([upper])
  })

  it('narrows with every word rather than widening', () => {
    expect(filterHistory(logs, { ...NO_FILTER, query: 'squat paused' }, nameOf, none)).toEqual([])
  })

  it('filters by day name and by records', () => {
    expect(filterHistory(logs, { ...NO_FILTER, day: 'Upper' }, nameOf, none)).toEqual([upper])
    const recordsIn = (id: string) => (id === 'legs' ? 2 : 0)
    expect(filterHistory(logs, { ...NO_FILTER, recordsOnly: true }, nameOf, recordsIn)).toEqual([
      legs,
    ])
  })

  it('reads the day name off the title', () => {
    expect(dayNameOf('Friday — Legs B')).toBe('Legs B')
    expect(dayNameOf('Freestyle')).toBe('Freestyle')
  })
})
