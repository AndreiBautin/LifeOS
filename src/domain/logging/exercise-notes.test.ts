import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { exerciseNotes } from './exercise-notes'

const BENCH = asExerciseId('bench-press')
const ROW = asExerciseId('barbell-row')

describe('an exercise’s notes', () => {
  const march = aWorkout({
    id: asWorkoutId('march'),
    date: '2026-03-02',
    notes: 'Slept badly',
    entries: [
      anEntry({
        exerciseId: BENCH,
        notes: 'Wider grip today',
        sets: [
          aSet({ isWarmup: true, notes: 'warm-up note' }),
          aSet({ actualLoad: 200, actualReps: 5 }),
          aSet({ actualLoad: 200, actualReps: 4, notes: '  Left shoulder twinged ' }),
        ],
      }),
      anEntry({ exerciseId: ROW, sets: [aSet({ notes: 'not the bench' })] }),
    ],
  })
  const april = aWorkout({
    id: asWorkoutId('april'),
    date: '2026-04-06',
    entries: [
      anEntry({ exerciseId: BENCH, sets: [aSet({ notes: '   ' }), aSet({ notes: 'Easy' })] }),
    ],
  })
  const notes = exerciseNotes([march, april], BENCH)

  it('gathers this exercise’s set and exercise notes, newest first', () => {
    expect(notes.map((note) => note.text)).toEqual([
      'Easy',
      'Wider grip today',
      'Left shoulder twinged',
    ])
  })

  it('numbers a set among the working sets and keeps what it was', () => {
    expect(notes.find((note) => note.text === 'Left shoulder twinged')?.set).toEqual({
      number: 2,
      load: 200,
      reps: 4,
    })
    expect(notes.find((note) => note.text === 'Wider grip today')?.set).toBeUndefined()
  })

  /* A session note is about the day; a warm-up is not the work. */
  it('leaves out session notes, warm-ups, blanks and other exercises', () => {
    const texts = notes.map((note) => note.text)
    expect(texts).not.toContain('Slept badly')
    expect(texts).not.toContain('warm-up note')
    expect(texts).not.toContain('not the bench')
    expect(notes).toHaveLength(3)
  })

  it('ignores a session still open', () => {
    const open = aWorkout({
      status: 'in-progress',
      entries: [anEntry({ exerciseId: BENCH, sets: [aSet({ notes: 'mid-session' })] })],
    })
    expect(exerciseNotes([open], BENCH)).toEqual([])
  })
})
