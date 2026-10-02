import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Exercise } from '@/domain/exercises/exercise'
import type { CheckInId, ExerciseId, MetricId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramPosition } from '@/domain/programs/position'
import type { AppSettings } from '@/domain/settings/settings'
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
  /**
   * Deletes without recording a tombstone.
   *
   * The receiving half of a sync. When another device's deletion arrives,
   * the tombstone is already known — it came in the batch — and the local
   * copy has to go with it. Routing that through `remove` would mint a
   * *second* tombstone stamped with this device's clock, which is both
   * redundant and, if the two clocks disagree, capable of overwriting the
   * original deletion with an earlier time and letting an intervening
   * edit resurrect the record.
   *
   * Named apart from `remove` so no call site can ask to delete and
   * silently skip recording that it did.
   */
  purge(id: ExerciseId): Promise<void>
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
  /** Stamps `updatedAt`. */
  save(position: ProgramPosition): Promise<void>
  /** Writes the position exactly as given — the other device's, from sync. */
  restore(position: ProgramPosition): Promise<void>
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
  /**
   * Deletes without recording a tombstone.
   *
   * The receiving half of a sync. When another device's deletion arrives,
   * the tombstone is already known — it came in the batch — and the local
   * copy has to go with it. Routing that through `remove` would mint a
   * *second* tombstone stamped with this device's clock, which is both
   * redundant and, if the two clocks disagree, capable of overwriting the
   * original deletion with an earlier time and letting an intervening
   * edit resurrect the record.
   *
   * Named apart from `remove` so no call site can ask to delete and
   * silently skip recording that it did.
   */
  purge(id: WorkoutId): Promise<void>
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
  /**
   * Deletes without recording a tombstone.
   *
   * The receiving half of a sync. When another device's deletion arrives,
   * the tombstone is already known — it came in the batch — and the local
   * copy has to go with it. Routing that through `remove` would mint a
   * *second* tombstone stamped with this device's clock, which is both
   * redundant and, if the two clocks disagree, capable of overwriting the
   * original deletion with an earlier time and letting an intervening
   * edit resurrect the record.
   *
   * Named apart from `remove` so no call site can ask to delete and
   * silently skip recording that it did.
   */
  purge(id: CheckInId): Promise<void>
  all(): Promise<readonly CheckIn[]>
}

/**
 * Metrics defined by hand, and the months they were recorded in.
 *
 * Only the hand-defined ones are stored: the measured ones are derived
 * from `domain/game/registry.ts` on every read, for the same reason the
 * training program is derived — a stored copy of a declaration can only
 * ever be a stale one.
 *
 * A snapshot is keyed by its month, which is the invariant the whole
 * record turns on: one review per month, and re-entering a value fixes the
 * one already there.
 */
export interface ReviewRepository {
  metrics(): Promise<readonly MetricDefinition[]>
  saveMetric(metric: MetricDefinition): Promise<void>
  removeMetric(id: MetricId): Promise<void>
  restoreMetrics(metrics: readonly MetricDefinition[]): Promise<void>

  snapshots(): Promise<readonly MonthlySnapshot[]>
  snapshot(month: string): Promise<MonthlySnapshot | undefined>
  saveSnapshot(snapshot: MonthlySnapshot): Promise<void>
  restoreSnapshots(snapshots: readonly MonthlySnapshot[]): Promise<void>
  removeSnapshot(month: string): Promise<void>
  purgeSnapshot(month: string): Promise<void>
}

/** Places worth going to. */

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

/**
 * The lifter's settings.
 *
 * A port because the sync needs to read and write them and lives in the
 * application layer, which may not know they are a JSON blob in
 * localStorage. Asynchronous even though the implementation is not, so
 * the seam survives a future where they are somewhere slower.
 */
export interface SettingsRepository {
  get(): Promise<AppSettings>
  save(settings: AppSettings): Promise<void>
}

/** A clock, injected so progression and scheduling are reproducible in a test. */
export interface Clock {
  now(): Date
}
