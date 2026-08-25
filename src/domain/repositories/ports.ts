import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { CheckInId, ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramPosition } from '@/domain/programs/position'
import type { Tombstone } from '@/domain/sync/tombstone'

/**
 * The ports the application layer talks to.
 *
 * Every one of these is an interface the domain owns and infrastructure
 * implements, so a use-case can be tested by handing it an in-memory
 * double rather than by standing up a database. That seam is what neither
 * old app had: LiftTracker constructed an EF `DbContext` inside Razor
 * components — `new LiftTrackerContextBuilder(Configuration).Build()`
 * appears inside render loops — and StrengthFlow called Firestore
 * directly from React components, so nothing in either could be tested
 * without a live backend.
 */

export interface ExerciseRepository {
  all(): Promise<readonly Exercise[]>
  byId(id: ExerciseId): Promise<Exercise | undefined>
  save(exercise: Exercise): Promise<void>
  /**
   * Writes records exactly as given, without stamping `updatedAt`.
   *
   * The restore path. A record arriving from a backup file or another
   * device already carries the time it last changed, and `save` would
   * overwrite that with *now* — making every incoming record the newest
   * thing in the database, which is precisely the comparison a merge
   * depends on. Named separately rather than flagged, so no call site can
   * ask to save and receive a restore.
   */
  restoreMany(exercises: readonly Exercise[]): Promise<void>
  remove(id: ExerciseId): Promise<void>
  count(): Promise<number>
}

/**
 * Where the lifter is in the program.
 *
 * The only thing about a program that persists. The program itself is
 * derived from settings on demand — see  for
 * why storing it turned out to be the source of every staleness bug
 * rather than protection against one.
 */
export interface PositionRepository {
  get(): Promise<ProgramPosition | undefined>
  save(position: ProgramPosition): Promise<void>
  clear(): Promise<void>
}

export interface WorkoutQuery {
  readonly from?: string
  readonly to?: string
  readonly limit?: number
}

export interface WorkoutRepository {
  byId(id: WorkoutId): Promise<WorkoutLog | undefined>
  /** Most recent first. */
  recent(limit: number): Promise<readonly WorkoutLog[]>
  inRange(query: WorkoutQuery): Promise<readonly WorkoutLog[]>
  onDate(date: string): Promise<readonly WorkoutLog[]>
  /**
   * Every workout containing an exercise, newest first. Backs both the
   * previous-performance placeholder and the estimated-max chart, and is
   * the query that most needs an index — StrengthFlow answered it by
   * downloading and scanning the entire workout collection on every set.
   */
  forExercise(exerciseId: ExerciseId, limit?: number): Promise<readonly WorkoutLog[]>
  inProgress(): Promise<WorkoutLog | undefined>
  save(log: WorkoutLog): Promise<void>
  /**
   * Writes records exactly as given, without stamping `updatedAt`.
   *
   * The restore path. A record arriving from a backup file or another
   * device already carries the time it last changed, and `save` would
   * overwrite that with *now* — making every incoming record the newest
   * thing in the database, which is precisely the comparison a merge
   * depends on. Named separately rather than flagged, so no call site can
   * ask to save and receive a restore.
   */
  restoreMany(logs: readonly WorkoutLog[]): Promise<void>
  remove(id: WorkoutId): Promise<void>
  count(): Promise<number>
  all(): Promise<readonly WorkoutLog[]>
}

export interface CheckInRepository {
  byId(id: CheckInId): Promise<CheckIn | undefined>
  forWorkout(workoutId: WorkoutId): Promise<readonly CheckIn[]>
  recent(limit: number): Promise<readonly CheckIn[]>
  save(checkIn: CheckIn): Promise<void>
  /**
   * Writes records exactly as given, without stamping `updatedAt`.
   *
   * The restore path. A record arriving from a backup file or another
   * device already carries the time it last changed, and `save` would
   * overwrite that with *now* — making every incoming record the newest
   * thing in the database, which is precisely the comparison a merge
   * depends on. Named separately rather than flagged, so no call site can
   * ask to save and receive a restore.
   */
  restoreMany(checkIns: readonly CheckIn[]): Promise<void>
  remove(id: CheckInId): Promise<void>
  all(): Promise<readonly CheckIn[]>
}

/**
 * What has been deleted, and when.
 *
 * Append-only. Nothing removes a tombstone, because the question
 * "has every device seen this yet" has no answer here — see
 * `domain/sync/tombstone.ts` for why they are cheap enough to keep.
 */
export interface TombstoneRepository {
  all(): Promise<readonly Tombstone[]>
  /** Deletions strictly after this timestamp, for an incremental pull. */
  since(deletedAt: string): Promise<readonly Tombstone[]>
  /**
   * Records tombstones that came from elsewhere — a backup file, or
   * another device. Deleting locally goes through the owning
   * repository's `remove`, which writes its own.
   */
  record(tombstones: readonly Tombstone[]): Promise<void>
}

/** A clock, injected so progression and scheduling are reproducible in a test. */
export interface Clock {
  now(): Date
}
