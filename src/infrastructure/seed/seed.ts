import { builtInExercises } from '@/domain/exercises/catalogue'
import type { IdGenerator } from '@/domain/ids/ids'
import type { ExerciseRepository, ProgramRepository } from '@/domain/repositories/ports'

import { builtInPrograms } from './built-in-programs'

/**
 * Filling an empty database, and only an empty one.
 *
 * Two separate named operations rather than one function with a flag.
 * `seedIfEmpty` can never destroy anything; `resetToBuiltIns` always
 * does. A single `seed(force)` would mean every call site is one wrong
 * boolean away from deleting a lifter's training history, and that is not
 * a risk worth the convenience of one fewer export.
 *
 * The emptiness check is per store, so a lifter who deleted every program
 * but kept their custom exercises gets the programs back without having
 * their exercise library overwritten.
 */

export interface SeedDeps {
  readonly exercises: ExerciseRepository
  readonly programs: ProgramRepository
  readonly ids: IdGenerator
  readonly now: Date
}

export interface SeedResult {
  readonly exercisesAdded: number
  readonly programsAdded: number
}

export async function seedIfEmpty(deps: SeedDeps): Promise<SeedResult> {
  const [exerciseCount, programCount] = await Promise.all([
    deps.exercises.count(),
    deps.programs.count(),
  ])

  let exercisesAdded = 0
  let programsAdded = 0

  if (exerciseCount === 0) {
    const exercises = builtInExercises()
    await deps.exercises.saveMany(exercises)
    exercisesAdded = exercises.length
  }

  if (programCount === 0) {
    const programs = builtInPrograms(deps.ids, deps.now)
    for (const program of programs) await deps.programs.save(program)
    programsAdded = programs.length
  }

  return { exercisesAdded, programsAdded }
}

/**
 * Restores the shipped exercises and programs over whatever is there.
 *
 * Destructive for built-in records; a lifter's own programs and exercises
 * keep their own ids and are untouched. Offered from Settings behind a
 * confirmation, for when an edit to a built-in has gone somewhere
 * unhelpful.
 */
export async function restoreBuiltIns(deps: SeedDeps): Promise<SeedResult> {
  const exercises = builtInExercises()
  await deps.exercises.saveMany(exercises)

  const programs = builtInPrograms(deps.ids, deps.now)
  for (const program of programs) await deps.programs.save(program)

  return { exercisesAdded: exercises.length, programsAdded: programs.length }
}
