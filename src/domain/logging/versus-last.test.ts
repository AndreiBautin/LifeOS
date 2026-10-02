import { describe, expect, it } from 'vitest'

import { asExerciseId } from '@/domain/ids/ids'
import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { isProgress, previousTopSet, topSet, versusLast } from './versus-last'

describe('a set against last time', () => {
  it('counts a heavier bar as progress whatever the reps did', () => {
    const versus = versusLast({ load: 230, reps: 3 }, { load: 225, reps: 5 })
    expect(versus).toEqual({ kind: 'heavier', by: 5 })
    expect(versus !== undefined && isProgress(versus)).toBe(true)
  })

  it('compares reps only at the same bar', () => {
    expect(versusLast({ load: 115, reps: 9 }, { load: 115, reps: 7 })).toEqual({
      kind: 'more-reps',
      by: 2,
    })
    expect(versusLast({ load: 115, reps: 6 }, { load: 115, reps: 7 })).toEqual({
      kind: 'fewer-reps',
      by: 1,
    })
    expect(versusLast({ load: 115, reps: 7 }, { load: 115, reps: 7 })).toEqual({ kind: 'matched' })
  })

  /*
   * A lighter bar with more reps is not quietly converted into "progress"
   * through an estimated max; it is reported as what it is.
   */
  it('reports a lighter bar as lighter, not as a win on reps', () => {
    const versus = versusLast({ load: 95, reps: 12 }, { load: 115, reps: 8 })
    expect(versus).toEqual({ kind: 'lighter', by: 20 })
    expect(versus !== undefined && isProgress(versus)).toBe(false)
  })

  it('reads a missing load as the body alone', () => {
    expect(versusLast({ reps: 11 }, { reps: 9 })).toEqual({ kind: 'more-reps', by: 2 })
  })

  it('subtracts small plates exactly', () => {
    expect(versusLast({ load: 102.5, reps: 5 }, { load: 101.25, reps: 5 })).toEqual({
      kind: 'heavier',
      by: 1.25,
    })
  })

  it('takes the heaviest bar as the top set, then the most reps at it', () => {
    expect(
      topSet([
        { load: 310, reps: 5 },
        { load: 320, reps: 2 },
        { load: 320, reps: 3 },
        { load: 330 },
      ]),
    ).toEqual({ load: 320, reps: 3 })
    expect(topSet([])).toBeUndefined()
  })

  it('has nothing to say without reps on both sides', () => {
    expect(versusLast({ load: 100 }, { load: 100, reps: 5 })).toBeUndefined()
  })
})

describe('last time, for a session in the past', () => {
  const bench = asExerciseId('bench-press')
  const session = (startedAt: string, load: number, reps: number, variant?: string) =>
    aWorkout({
      date: startedAt.slice(0, 10),
      startedAt,
      entries: [
        anEntry({
          exerciseId: bench,
          ...(variant === undefined ? {} : { variant }),
          sets: [aSet({ actualLoad: load, actualReps: reps, outcome: 'completed' })],
        }),
      ],
    })

  /*
   * A session opened months later is judged against the one before it.
   * Reading the newest session instead would compare August with today.
   */
  it('reads the session before it, not the newest one', () => {
    const june = session('2026-06-01T09:00:00Z', 200, 5)
    const july = session('2026-07-01T09:00:00Z', 205, 5)
    const today = session('2026-10-01T09:00:00Z', 230, 3)
    expect(previousTopSet([today, july, june], july, bench, undefined)).toEqual({
      load: 200,
      reps: 5,
    })
  })

  it('keeps two versions of one exercise apart', () => {
    const heavy = session('2026-06-01T09:00:00Z', 200, 12, 'Heavy')
    const light = session('2026-06-03T09:00:00Z', 140, 25, 'Light')
    const now = session('2026-06-08T09:00:00Z', 205, 12, 'Heavy')
    expect(previousTopSet([light, heavy], now, bench, 'Heavy')).toEqual({ load: 200, reps: 12 })
  })
})
