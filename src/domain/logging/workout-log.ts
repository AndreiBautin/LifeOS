import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { CheckInId, ExerciseId, SlotId, WorkoutId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'
import type { SlotRole } from '@/domain/programs/program'
import { bestEstimate, type E1rmEstimate } from '@/domain/strength/one-rep-max'
import { slotVolume, sumVolume, type VolumeMap } from '@/domain/volume/accounting'
import { emptyVolumeMap } from '@/domain/volume/landmarks'

/**
 * What actually happened, as distinct from what was prescribed.
 *
 * The single most important structural change from all three source
 * repositories. LiftTracker generated `Set` rows into the database when a
 * program was created and then wrote actual reps and load into those same
 * rows — so the program *was* the log. Editing a program rewrote history;
 * a completed cycle could not be repeated; and planned-versus-actual
 * could not be compared, because only one of the two survived. StrengthFlow
 * collapsed them differently but just as thoroughly, keeping a single
 * `currentProgram` document and date-keyed workout documents with no link
 * between them.
 *
 * Here a workout log is its own record. It embeds what was asked for
 * alongside what was done, references the program by id, and is never
 * written back into the template.
 */

/**
 * What became of a prescribed set.
 *
 * `pending` is a distinct state and not an absence, because the
 * alternative — treating "not yet done" as a completed set with no
 * numbers in it — lets unperformed work count toward volume, which is the
 * one number the entire autoregulation loop depends on. Skipping is also
 * its own outcome rather than a gap, carried from LiftTracker, which was
 * right to separate `IsSkipped` from `IsComplete`: choosing not to do
 * something is information, and abandoning a session halfway is a
 * different thing again.
 */
export type SetOutcome = 'pending' | 'completed' | 'skipped' | 'failed'

export interface LoggedSet {
  /** What the program asked for, frozen at the moment the set was opened. */
  readonly plannedLoad?: number
  readonly plannedReps?: number
  readonly prescription: SetPrescription

  readonly actualLoad?: number
  readonly actualReps?: number
  readonly actualRpe?: number

  /**
   * Skipping is a recorded outcome, not an absence — carried from
   * LiftTracker, which was right to distinguish `IsSkipped` from
   * `IsComplete`. A skipped set means "I chose not to do this"; a missing
   * set means the session was never finished. Analytics treat them
   * differently and so does the volume count.
   */
  readonly outcome: SetOutcome
  readonly isWarmup: boolean
  readonly completedAt?: string
  readonly notes?: string
}

export interface LogEntry {
  readonly exerciseId: ExerciseId
  readonly role: SlotRole
  /**
   * The slot's sub-category, copied at the time the session was started.
   *
   * Embedded rather than looked up, for the same reason the prescription
   * is: a log describes itself. Absent on anything logged before slots
   * carried one.
   */
  readonly variant?: string
  /** Links back to the slot this came from, when the workout follows a program. */
  readonly slotId?: SlotId
  readonly order: number
  readonly sets: readonly LoggedSet[]
  readonly notes?: string
  /** Set when the lifter swapped the prescribed exercise for another. */
  readonly substitutedFor?: ExerciseId
}

export type WorkoutStatus = 'in-progress' | 'completed' | 'abandoned'

/** Where in a program this workout sits. Absent for a freestyle session. */
export interface LoggedPosition {
  readonly blockIndex: number
  readonly cycleNumber: number
  readonly weekIndex: number
  readonly dayIndex: number
}

export interface WorkoutLog {
  readonly id: WorkoutId
  /**
   * Absent for a workout logged with no program attached. Training
   * without a program is a first-class path, not a degenerate case —
   * both old apps made it impossible.
   */
  readonly position?: LoggedPosition
  readonly date: string
  readonly startedAt: string
  readonly completedAt?: string
  readonly status: WorkoutStatus
  readonly title: string
  readonly entries: readonly LogEntry[]
  readonly preCheckInId?: CheckInId
  readonly postCheckInId?: CheckInId
  readonly bodyweight?: number
  /**
   * What the day set out to deliver, per muscle, in credited sets.
   *
   * Copied from the program day when the session is started, for the
   * same reason every set carries its own prescription: a log describes
   * itself. Reading it back off the program would make a mid-session
   * tally depend on settings that may since have moved, and the target
   * a lifter is measuring against must not change under them while they
   * are measuring.
   *
   * Absent on a freestyle session and on anything logged before this
   * existed, which is why every reader treats it as optional.
   */
  readonly volumeTargets?: Readonly<Partial<Record<MuscleGroup, number>>>
  readonly notes?: string
  /**
   * When this record last changed, ISO.
   *
   * Optional because records written before it existed do not have one,
   * and a migration cannot invent a truthful value for them. Everything
   * that compares it treats "absent" as "older than anything that can
   * name a time", which is the only safe reading: a record that cannot
   * prove it is newer must not win a merge.
   *
   * Stamped by the repository on save rather than by callers, so it
   * cannot be forgotten on one write path out of five.
   */
  readonly updatedAt?: string
}

/* -------------------------------------------------------------------- */
/* Derived facts                                                         */
/* -------------------------------------------------------------------- */

/** Sets that count: performed, and not a warm-up. */
export function workingSets(entry: LogEntry): readonly LoggedSet[] {
  return entry.sets.filter((set) => !set.isWarmup && set.outcome === 'completed')
}

export function isEntryComplete(entry: LogEntry): boolean {
  return entry.sets.every((set) => set.outcome !== 'pending')
}

/** A workout is finishable once nothing is left untouched. */
export function remainingSets(log: WorkoutLog): number {
  return log.entries.reduce(
    (total, entry) => total + entry.sets.filter((set) => set.outcome === 'pending').length,
    0,
  )
}

export function totalWorkingSets(log: WorkoutLog): number {
  return log.entries.reduce((total, entry) => total + workingSets(entry).length, 0)
}

/**
 * Tonnage — load times reps, summed. A blunt instrument, and deliberately
 * separate from set counts: sets are what the volume landmarks are stated
 * in, and mixing the two is how StrengthFlow's charts came to plot reps
 * on an axis labelled volume.
 */
export function totalTonnage(log: WorkoutLog): number {
  let total = 0
  for (const entry of log.entries) {
    for (const set of workingSets(entry)) {
      if (set.actualLoad !== undefined && set.actualReps !== undefined) {
        total += set.actualLoad * set.actualReps
      }
    }
  }
  return Number(total.toFixed(1))
}

/**
 * What a logged set actually was, in the shape the accounting reads.
 *
 * Credit depends on reps and on how close to failure the set ended, and
 * both of those are *discovered*. Counting the prescription instead meant
 * a set planned at five reps and taken for three was credited as five —
 * which mattered little while it only fed a history chart, and matters a
 * great deal now that the accessory work resizes against the same number.
 * A lifter cutting a set short would have the app conclude the muscle was
 * covered.
 *
 * The plan is the fallback, not the answer. A set logged with reps and no
 * RPE keeps the prescribed target, because that is what the lifter was
 * aiming at and no better evidence exists.
 *
 * The load is rewritten as a bare RPE, which is lossy and deliberately
 * local to this function: `slotVolume` reads the load *only* to recover an
 * expected RPE, so nothing downstream can see the difference. Anything
 * needing the real prescription reads `set.prescription`.
 */
function asPerformed(set: LoggedSet): SetPrescription {
  return {
    ...set.prescription,
    ...(set.actualReps !== undefined
      ? { reps: { kind: 'fixed' as const, reps: set.actualReps } }
      : {}),
    ...(set.actualRpe !== undefined
      ? { load: { kind: 'rpe' as const, target: set.actualRpe } }
      : {}),
  }
}

/** Per-muscle set counts for one workout, using the same rules as planning. */
export function loggedVolume(
  log: WorkoutLog,
  lookup: (id: ExerciseId) => Exercise | undefined,
): VolumeMap {
  const contributions: VolumeMap[] = []

  for (const entry of log.entries) {
    const exercise = lookup(entry.exerciseId)
    if (exercise === undefined) continue

    const performed = workingSets(entry)
    if (performed.length === 0) continue

    // Reuses the planning-side accounting so a completed week and a
    // planned week are counted by identical rules. Two implementations
    // would drift, and the whole autoregulation loop depends on the
    // comparison being meaningful.
    contributions.push(slotVolume(exercise, performed.map(asPerformed)))
  }

  return contributions.length > 0 ? sumVolume(contributions) : emptyVolumeMap()
}

/**
 * The best one-rep-max estimate this workout produced for an exercise.
 *
 * Under 5/3/1 this is what makes every cycle a test: the AMRAP set is a
 * near-maximal effort by design, so a fresh estimate falls out of normal
 * training without a dedicated test day.
 */
export function estimateFromWorkout(
  log: WorkoutLog,
  exerciseId: ExerciseId,
): E1rmEstimate | undefined {
  const sets = log.entries
    .filter((entry) => entry.exerciseId === exerciseId)
    .flatMap((entry) => workingSets(entry))
    .flatMap((set) =>
      set.actualLoad !== undefined && set.actualReps !== undefined
        ? [{ load: set.actualLoad, reps: set.actualReps }]
        : [],
    )

  return bestEstimate(sets)
}

/**
 * The reps achieved on the AMRAP set of a given role, if there was one.
 *
 * This is the input to 5/3/1's conditional progression: beat the
 * prescribed minimum and the training max goes up; miss it and the max is
 * cut rather than held.
 */
export function amrapResult(
  log: WorkoutLog,
  role: SlotRole,
):
  { readonly exerciseId: ExerciseId; readonly reps: number; readonly minimum: number } | undefined {
  for (const entry of log.entries) {
    if (entry.role !== role) continue

    for (const set of entry.sets) {
      if (set.prescription.reps.kind !== 'amrap') continue
      if (set.outcome !== 'completed' || set.actualReps === undefined) continue

      return {
        exerciseId: entry.exerciseId,
        reps: set.actualReps,
        minimum: set.prescription.reps.minimum,
      }
    }
  }
  return undefined
}

/**
 * Whether a logged set matched or beat the same set last time.
 *
 * StrengthFlow's post-workout report, which compared each set index
 * against the session before and told you which exercises regressed. Kept
 * because it is the most useful single sentence an app can say after a
 * workout, and pulled into the domain so it is testable — there it lived
 * inside a Firestore query that walked every workout document in the
 * database on every save.
 */
export function comparePerformance(
  current: { readonly load?: number; readonly reps?: number },
  previous: { readonly load?: number; readonly reps?: number },
): 'better' | 'matched' | 'worse' | 'incomparable' {
  if (
    current.load === undefined ||
    current.reps === undefined ||
    previous.load === undefined ||
    previous.reps === undefined
  ) {
    return 'incomparable'
  }

  if (current.load > previous.load) return 'better'
  if (current.load < previous.load) return 'worse'
  if (current.reps > previous.reps) return 'better'
  if (current.reps < previous.reps) return 'worse'
  return 'matched'
}
