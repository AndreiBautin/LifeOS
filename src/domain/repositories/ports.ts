import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { CheckInId, ExerciseId, InstanceId, ProgramId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramTemplate } from '@/domain/programs/program'

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
  saveMany(exercises: readonly Exercise[]): Promise<void>
  remove(id: ExerciseId): Promise<void>
  count(): Promise<number>
}

export interface ProgramRepository {
  all(): Promise<readonly ProgramTemplate[]>
  byId(id: ProgramId): Promise<ProgramTemplate | undefined>
  save(program: ProgramTemplate): Promise<void>
  remove(id: ProgramId): Promise<void>
  count(): Promise<number>
}

/**
 * A program being run, as distinct from the program itself.
 *
 * Holds the frozen snapshot of the template it started from, so editing
 * the template afterwards cannot rewrite what an in-flight cycle
 * prescribes — the single sharpest edge in LiftTracker's model, where the
 * program and the log were the same rows.
 */
export interface ProgramInstance {
  readonly id: InstanceId
  readonly programId: ProgramId
  readonly templateSnapshot: ProgramTemplate
  readonly name: string
  readonly startedAt: string
  readonly status: 'active' | 'paused' | 'completed' | 'abandoned'
  readonly cycleNumber: number
  readonly blockIndex: number
  readonly weekIndex: number
  readonly dayIndex: number
  readonly trainingMaxesAtStart: Readonly<Partial<Record<ExerciseId, number>>>
  readonly completedAt?: string
}

export interface InstanceRepository {
  all(): Promise<readonly ProgramInstance[]>
  byId(id: InstanceId): Promise<ProgramInstance | undefined>
  active(): Promise<ProgramInstance | undefined>
  save(instance: ProgramInstance): Promise<void>
  remove(id: InstanceId): Promise<void>
}

export interface WorkoutQuery {
  readonly from?: string
  readonly to?: string
  readonly instanceId?: InstanceId
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
  remove(id: WorkoutId): Promise<void>
  count(): Promise<number>
  all(): Promise<readonly WorkoutLog[]>
}

export interface CheckInRepository {
  byId(id: CheckInId): Promise<CheckIn | undefined>
  forWorkout(workoutId: WorkoutId): Promise<readonly CheckIn[]>
  recent(limit: number): Promise<readonly CheckIn[]>
  save(checkIn: CheckIn): Promise<void>
  remove(id: CheckInId): Promise<void>
  all(): Promise<readonly CheckIn[]>
}

/** A clock, injected so progression and scheduling are reproducible in a test. */
export interface Clock {
  now(): Date
}
