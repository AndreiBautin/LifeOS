import { builtInExercises } from '@/domain/exercises/catalogue'
import type { IdGenerator } from '@/domain/ids/ids'
import type {
  ExerciseRepository,
  InstanceRepository,
  ProgramRepository,
} from '@/domain/repositories/ports'

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

export interface ProgramSyncResult {
  readonly added: readonly string[]
  /** Every built-in id, for the caller to record as delivered. */
  readonly allIds: readonly string[]
}

/**
 * Adds built-in programs this install has never been offered.
 *
 * The same upgrade problem as {@link syncBuiltInExercises}: `seedIfEmpty`
 * skips a non-empty program store, so a program shipped in an update
 * would reach new installs only, and an existing lifter would never see
 * it — the failure being silent, since nothing looks broken.
 *
 * Unlike exercises, a missing program is not necessarily a gap to fill:
 * the lifter may have deleted it. So the test is *never delivered*, not
 * *not present*, and `delivered` is passed in rather than read here so
 * this stays a pure function of its inputs.
 *
 * Built-in programs have stable ids (`built-in-rp-block`), which is what
 * makes any of this possible — a generated id could not be recognised
 * across runs.
 */
export async function syncBuiltInPrograms(
  deps: SeedDeps,
  delivered: ReadonlySet<string>,
): Promise<ProgramSyncResult> {
  const programs = builtInPrograms(deps.ids, deps.now)
  const allIds = programs.map((program) => program.id as string)

  const present = new Set((await deps.programs.all()).map((program) => program.id as string))
  const missing = programs.filter(
    (program) => !present.has(program.id as string) && !delivered.has(program.id as string),
  )

  for (const program of missing) await deps.programs.save(program)

  return { added: missing.map((program) => program.id as string), allIds }
}

/**
 * Removes built-in programs the app no longer ships.
 *
 * Withdrawing a built-in from the code only stops new installs receiving
 * it. An existing lifter keeps their copy forever, which is how an app
 * accumulates a library of things its author has already decided against
 * — the 5/3/1 templates being exactly that case.
 *
 * Two things are never removed. A program the lifter created themselves,
 * because `origin` is checked; and any program an instance refers to,
 * because deleting the template a run points at would leave a workout
 * history hanging off nothing. A run in progress is unaffected either
 * way — it holds a frozen snapshot — but the template is what its
 * history is filed under.
 */
export async function retireBuiltInPrograms(
  deps: SeedDeps & { readonly instances: InstanceRepository },
  retiredIds: readonly string[],
): Promise<readonly string[]> {
  const retired = new Set(retiredIds)
  const inUse = new Set(
    (await deps.instances.all()).map((instance) => instance.programId as string),
  )

  const doomed = (await deps.programs.all()).filter(
    (program) =>
      retired.has(program.id as string) &&
      program.origin === 'built-in' &&
      !inUse.has(program.id as string),
  )

  for (const program of doomed) await deps.programs.remove(program.id)
  return doomed.map((program) => program.id as string)
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
