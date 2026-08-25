import { builtInExercises } from '@/domain/exercises/catalogue'
import type { ProgramTemplate } from '@/domain/programs/program'
import { asInstanceId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type {
  ExerciseRepository,
  InstanceRepository,
  ProgramRepository,
  WorkoutRepository,
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
 * Rewrites a stored built-in whose shipped definition has changed.
 *
 * The gap that `syncBuiltInPrograms` leaves. That one adds programs an
 * install has never been offered — but a program it *has* been offered
 * and whose content has since changed is never touched, so an install
 * keeps the block it was first given forever. Every improvement to the
 * assembler reached new installs only, and the symptom was subtle: a
 * block that still worked, still opened, and quietly described a
 * different split from the one the code now builds.
 *
 * A built-in the lifter has **edited** is left alone. `updatedAt` moving
 * past `createdAt` is the signal, which is exactly what `saveProgram`
 * writes. Their edit is theirs; the app has no business overwriting it to
 * deliver a refinement.
 *
 * The running instance is untouched either way — it holds a frozen
 * snapshot, so a block in progress keeps prescribing what it started
 * with, and the new shape applies to the next run.
 */
export async function refreshBuiltInPrograms(deps: SeedDeps): Promise<readonly string[]> {
  const shipped = builtInPrograms(deps.ids, deps.now)
  const refreshed: string[] = []

  for (const program of shipped) {
    const existing = await deps.programs.byId(program.id)
    if (existing === undefined) continue
    if (existing.origin !== 'built-in') continue

    // Edited by the lifter: leave it.
    if (existing.updatedAt !== existing.createdAt) continue

    // Compared on content rather than on a version number nobody would
    // remember to bump. Ids are regenerated on every assembly, so they
    // are excluded — otherwise every start would look like a change.
    if (contentOf(existing) === contentOf(program)) continue

    /*
     * Both timestamps are carried over from the stored copy, which keeps
     * them equal.
     *
     * That equality is the "the lifter has not touched this" signal, and
     * writing a fresh `updatedAt` here destroyed it: the first refresh
     * made the program look edited, and every refresh after that skipped
     * it. One update landed and the install was then stuck forever — the
     * exact failure this function exists to prevent, reintroduced by the
     * fix for it.
     *
     * The app restating its own template is not an edit.
     */
    await deps.programs.save({
      ...program,
      createdAt: existing.createdAt,
      updatedAt: existing.createdAt,
    })
    refreshed.push(program.id)
  }

  return refreshed
}

/** A program's content, ignoring the ids regenerated on every assembly. */
function contentOf(program: ProgramTemplate): string {
  return JSON.stringify(program, (key, value) =>
    key === 'id' || key === 'createdAt' || key === 'updatedAt' ? undefined : (value as unknown),
  )
}

/**
 * Re-snapshots a run that has not been trained yet.
 *
 * A `ProgramInstance` holds a frozen copy of its template on purpose: a
 * cycle in progress must keep prescribing what it started with. That
 * invariant is load-bearing and is not being weakened here.
 *
 * But it collides with a block the app starts *for* the lifter. The
 * auto-started run snapshots whatever template existed at first launch,
 * so every later refresh reaches the template and never the run — the
 * lifter trains the old block indefinitely while the library shows the
 * new one.
 *
 * The resolution is the one case where re-snapshotting can lose nothing:
 * a run with no workouts logged against it has no history to protect. It
 * is a plan nobody has acted on, and replacing it is not rewriting the
 * past.
 */
export async function resnapshotUntrainedInstance(
  deps: SeedDeps & { readonly instances: InstanceRepository; readonly workouts: WorkoutRepository },
): Promise<boolean> {
  const instance = await deps.instances.active()
  if (instance === undefined) return false

  const program = await deps.programs.byId(instance.programId)
  if (program === undefined) return false
  if (contentOf(program) === contentOf(instance.templateSnapshot)) return false

  // Anything logged at all — including a session in progress — means the
  // lifter has started acting on this plan.
  const logged = await deps.workouts.recent(500)
  if (logged.some((workout) => workout.position?.instanceId === instance.id)) return false

  await deps.instances.save({
    ...instance,
    name: program.name,
    templateSnapshot: program,
  })

  return true
}

/**
 * Removes built-in exercises the app no longer ships.
 *
 * The mirror of {@link syncBuiltInExercises}, and needed for the same
 * reason: that one is additive, so an exercise withdrawn from the
 * catalogue stays in an existing library and keeps being selected. The
 * behind-the-back shrug was removed from the code and went on appearing
 * in generated blocks for exactly this reason.
 *
 * Archived rather than deleted. A withdrawn exercise may appear in
 * workouts already logged, and deleting it would leave that history
 * pointing at nothing — the assembler skips archived entries, which is
 * all that is needed to keep it out of future blocks.
 */
export async function retireBuiltInExercises(
  deps: SeedDeps,
  retiredSlugs: readonly string[],
): Promise<readonly string[]> {
  // An explicit list rather than "everything the catalogue no longer
  // contains". An `Exercise` carries no origin, so the broader rule would
  // archive every exercise the lifter had created themselves — the whole
  // custom library, silently, on the next start.
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

/**
 * Starts the default block when nothing is running.
 *
 * The app ships one program, and a lifter opening it should be looking at
 * today's session rather than at a library with one thing in it and a
 * button to press. Picking is a step that exists only because there was
 * once something to pick between.
 *
 * Runs only when there is no instance at all — not merely no *active*
 * one. A paused or completed run means the lifter has made a decision
 * about what they are doing, and silently starting a fresh cycle over the
 * top of it would lose their position.
 */
export async function startDefaultProgram(
  deps: SeedDeps & { readonly instances: InstanceRepository },
  programId: string,
): Promise<boolean> {
  const existing = await deps.instances.all()
  if (existing.length > 0) return false

  const program = await deps.programs.byId(asProgramId(programId))
  if (program === undefined) return false

  await deps.instances.save({
    id: asInstanceId(deps.ids.next()),
    programId: program.id,
    templateSnapshot: program,
    name: program.name,
    startedAt: deps.now.toISOString(),
    status: 'active',
    cycleNumber: 1,
    blockIndex: 0,
    weekIndex: 0,
    dayIndex: 0,
  })

  return true
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
