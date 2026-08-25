import { builtInExercises } from '@/domain/exercises/catalogue'
import type { IdGenerator } from '@/domain/ids/ids'
import type { ExerciseRepository } from '@/domain/repositories/ports'

/**
 * Filling an empty database, and only an empty one.
 *
 * Only the exercise library is seeded. The program is derived from
 * settings rather than stored, so there is nothing else to fill.
 *
 * Two separate named operations rather than one function with a flag.
 * `seedIfEmpty` can never destroy anything; `clearAllStores` always does.
 * A single `seed(force)` would mean every call site is one wrong boolean
 * away from deleting a lifter's training history.
 */

export interface SeedDeps {
  readonly exercises: ExerciseRepository
  readonly ids: IdGenerator
  readonly now: Date
}

export async function seedIfEmpty(deps: SeedDeps): Promise<number> {
  if ((await deps.exercises.count()) > 0) return 0

  const exercises = builtInExercises()
  await deps.exercises.saveMany(exercises)
  return exercises.length
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
 * Restores the shipped exercise library over whatever is there.
 *
 * Destructive for built-in entries; a lifter's own exercises keep their
 * own ids and are untouched. Offered from Settings behind a confirmation,
 * for when an edit to a built-in has gone somewhere unhelpful.
 */
export async function restoreBuiltIns(deps: SeedDeps): Promise<number> {
  const exercises = builtInExercises()
  await deps.exercises.saveMany(exercises)
  return exercises.length
}

/**
 * Archives exercises the app no longer ships.
 *
 * The mirror of {@link syncBuiltInExercises}, and needed for the same
 * reason: that one is additive, so an exercise withdrawn from the
 * catalogue stays in an existing library and keeps being selected.
 *
 * Archived rather than deleted — a withdrawn exercise may appear in
 * workouts already logged, and deleting it would leave that history
 * pointing at nothing. An explicit list rather than "everything the
 * catalogue no longer contains", because an `Exercise` carries no origin
 * and the broader rule would archive the lifter's whole custom library.
 */
export async function retireBuiltInExercises(
  deps: SeedDeps,
  retiredSlugs: readonly string[],
): Promise<readonly string[]> {
  const retired = new Set(retiredSlugs)
  const stored = await deps.exercises.all()

  const withdrawn = stored.filter(
    (exercise) => retired.has(exercise.id as string) && !exercise.isArchived,
  )

  for (const exercise of withdrawn) {
    await deps.exercises.save({ ...exercise, isArchived: true })
  }

  return withdrawn.map((exercise) => exercise.id as string)
}

/** Exercise slugs that shipped once and have since been withdrawn. */
export const RETIRED_EXERCISE_SLUGS: readonly string[] = [
  'behind-back-shrug',
  'lunge',
  'bulgarian-split-squat',
]
