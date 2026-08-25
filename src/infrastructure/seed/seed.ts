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
 * Adds built-in exercises that are missing, and touches nothing else.
 *
 * Seeding deliberately cannot overwrite, which is right for a lifter's
 * data and wrong for the app's own reference library: an install created
 * before an exercise shipped would never receive it, and any program
 * referencing that exercise would quietly drop the slot rather than fail
 * — a session simply arriving with fewer exercises than it should.
 *
 * So this runs on every start and is additive only. An exercise the
 * lifter has edited keeps their version, because it already exists and is
 * therefore skipped.
 */
export async function syncBuiltInExercises(deps: SeedDeps): Promise<number> {
  const existing = new Set((await deps.exercises.all()).map((exercise) => exercise.id as string))
  const missing = builtInExercises().filter((exercise) => !existing.has(exercise.id))

  if (missing.length > 0) await deps.exercises.saveMany(missing)
  return missing.length
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
