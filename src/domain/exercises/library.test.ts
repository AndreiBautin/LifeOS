import { describe, expect, it } from 'vitest'

import type { Exercise } from '@/domain/exercises/exercise'
import { resolveLibrary } from '@/domain/exercises/library'
import { asExerciseId } from '@/domain/ids/ids'

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
    safeToFail: true,
    isBuiltIn: true,
    isArchived: false,
    ...overrides,
  }
}

describe('resolving the exercise library', () => {
  /*
   * The failure this exists to prevent: a rep range widened in the
   * catalogue reached the code and not the device, because the stored
   * copy was written once and every delivery mechanism since was
   * additive.
   */
  it('takes a changed built-in from the catalogue, not from the store', () => {
    const shipped = exercise('db-curl', { defaultRepRange: { low: 10, high: 30 } })
    const onDevice = exercise('db-curl', { defaultRepRange: { low: 10, high: 15 } })

    const library = resolveLibrary([shipped], [onDevice])

    expect(library).toHaveLength(1)
    expect(library[0]?.defaultRepRange).toEqual({ low: 10, high: 30 })
  })

  it('keeps a withdrawn built-in, archived, so history still resolves', () => {
    const retired = exercise('incline-push-up')

    const library = resolveLibrary([exercise('db-curl')], [retired])
    const found = library.find((entry) => (entry.id as string) === 'incline-push-up')

    expect(found).toBeDefined()
    expect(found?.isArchived).toBe(true)
  })

  /*
   * The retirement list this replaces could not tell a withdrawn built-in
   * from a lifter's own exercise, which is why it had to be written by
   * hand. `isBuiltIn` answers it directly.
   */
  it('leaves a lifter’s own exercise alone', () => {
    const mine = exercise('my-cable-thing', { isBuiltIn: false })

    const library = resolveLibrary([exercise('db-curl')], [mine])
    const found = library.find((entry) => (entry.id as string) === 'my-cable-thing')

    expect(found?.isArchived).toBe(false)
  })

  it('needs nothing in the store at all', () => {
    expect(resolveLibrary([exercise('db-curl')], [])).toHaveLength(1)
  })
})
