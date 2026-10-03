import { describe, expect, it } from 'vitest'

import type { Exercise } from '@/domain/exercises/exercise'
import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { LIBRARY_WEEKS, libraryShelves } from './library'

function exercise(slug: string, overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: asExerciseId(slug),
    name: slug,
    primaryMuscle: 'biceps',
    secondaryMuscles: [],
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    isUnilateral: false,
    isCompetition: false,
    loadBasis: 'estimated-1rm',
    intent: 'hypertrophy',
    sfr: 4,
    isBuiltIn: true,
    isArchived: false,
    ...overrides,
  }
}

const TODAY = '2026-10-03' // a Saturday
const CURL = exercise('curl')
const HAMMER = exercise('hammer')
const PREACHER = exercise('preacher')
const DIPS = exercise('dips', { primaryMuscle: 'chest' })
const OLD = exercise('old', { isArchived: true })

function didOn(date: string, slug: string, sets = 3) {
  return aWorkout({
    date,
    entries: [
      anEntry({
        exerciseId: asExerciseId(slug),
        sets: Array.from({ length: sets }, () => aSet({ actualLoad: 50, actualReps: 10 })),
      }),
    ],
  })
}

describe('the exercise library', () => {
  const shelves = libraryShelves(
    [CURL, HAMMER, PREACHER, DIPS, OLD],
    [didOn('2026-09-29', 'hammer'), didOn('2026-08-01', 'preacher')],
    new Set([asExerciseId('curl')]),
    TODAY,
  )
  const biceps = shelves.find((shelf) => shelf.muscle === 'biceps')

  it('shelves by muscle in the taxonomy order', () => {
    expect(shelves.map((shelf) => shelf.muscle)).toEqual(['chest', 'biceps'])
  })

  it('leads with the routine, then the most recently done, then by name', () => {
    expect(biceps?.rows.map((row) => row.exercise.name)).toEqual(['curl', 'hammer', 'preacher'])
  })

  it('leaves out a retired exercise nobody did, and keeps one somebody did', () => {
    expect(biceps?.rows.some((row) => row.exercise.name === 'old')).toBe(false)
    const kept = libraryShelves([OLD], [didOn('2026-01-01', 'old')], new Set(), TODAY)
    expect(kept[0]?.rows[0]?.lastDone).toBe('2026-01-01')
  })

  /* The strip is calendar weeks, this one last: Tuesday the 29th is this week. */
  it('counts working sets per calendar week, oldest first', () => {
    const hammer = biceps?.rows.find((row) => row.exercise.name === 'hammer')
    expect(hammer?.weeks).toHaveLength(LIBRARY_WEEKS)
    expect(hammer?.weeks.at(-1)).toBe(3)
    expect(hammer?.weeks.slice(0, -1).every((sets) => sets === 0)).toBe(true)
  })

  it('remembers a last day older than the strip', () => {
    const preacher = biceps?.rows.find((row) => row.exercise.name === 'preacher')
    expect(preacher?.lastDone).toBe('2026-08-01')
    expect(preacher?.weeks.reduce((a, b) => a + b, 0)).toBe(3)
    const ancient = libraryShelves([PREACHER], [didOn('2025-01-01', 'preacher')], new Set(), TODAY)
    expect(ancient[0]?.rows[0]?.weeks.every((sets) => sets === 0)).toBe(true)
  })

  it('ignores a session still open and sets not done', () => {
    const open = aWorkout({
      date: TODAY,
      status: 'in-progress',
      entries: [anEntry({ exerciseId: asExerciseId('curl'), sets: [aSet()] })],
    })
    const skipped = aWorkout({
      date: TODAY,
      entries: [
        anEntry({ exerciseId: asExerciseId('curl'), sets: [aSet({ outcome: 'skipped' })] }),
      ],
    })
    const [shelf] = libraryShelves([CURL], [open, skipped], new Set(), TODAY)
    expect(shelf?.rows[0]?.lastDone).toBeUndefined()
  })
})
