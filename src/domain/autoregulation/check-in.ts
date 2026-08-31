import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { CheckInId, WorkoutId } from '@/domain/ids/ids'

/**
 * Pre- and post-workout check-ins.
 *
 * StrengthFlow's most interesting idea and its worst-implemented one. It
 * asked, before a session, whether each muscle had recovered, and after
 * one, how hard the workload felt — then wrote the answer straight into a
 * per-muscle `volume` counter with `increment(-1)` or `increment(+1)`.
 * No record of the answer survived, there was no floor or ceiling, no
 * undo, and the counter it moved had no relationship to what the program
 * actually prescribed. Answer "not recovered" often enough and a muscle's
 * volume walked to zero with nothing to say why.
 *
 * The idea is sound: it is exactly how Renaissance Periodization proposes
 * finding a lifter's real volume tolerance. What was missing was that the
 * answers are *evidence*, not commands. Here a check-in is an immutable
 * record, and adjusting a landmark is a separate, bounded, explained
 * proposal derived from those records — reviewable before it applies and
 * reversible after, because the evidence is still there.
 */

export const RECOVERY_STATES = ['not-recovered', 'recovered-on-time', 'recovered-early'] as const
export type RecoveryState = (typeof RECOVERY_STATES)[number]

export const RECOVERY_LABELS: Record<RecoveryState, string> = {
  'not-recovered': 'Still sore',
  'recovered-on-time': 'Recovered on time',
  'recovered-early': 'Recovered a while ago',
}

export const WORKLOAD_STATES = ['easy', 'moderate', 'hard', 'too-much'] as const
export type WorkloadState = (typeof WORKLOAD_STATES)[number]

export const WORKLOAD_LABELS: Record<WorkloadState, string> = {
  easy: 'Easy',
  moderate: 'About right',
  hard: 'Hard but manageable',
  'too-much': 'Too much',
}

/**
 * Lifestyle factors, asked before a session.
 *
 * Deliberately kept separate from the recovery ratings, because they mean
 * something different. Sleeping badly for one night is a reason to cut
 * *today's* volume; it is not evidence that a muscle's weekly tolerance
 * has changed. StrengthFlow ran both through the same code path, so a bad
 * night's sleep permanently reduced the program.
 */
export const READINESS_SCALE = ['poor', 'ok', 'good'] as const
export type ReadinessLevel = (typeof READINESS_SCALE)[number]

export interface ReadinessFactors {
  readonly sleep: ReadinessLevel
  readonly nutrition: ReadinessLevel
  readonly hydration: ReadinessLevel
  readonly stress: ReadinessLevel
  readonly motivation: ReadinessLevel
}

export interface PreWorkoutCheckIn {
  readonly id: CheckInId
  readonly kind: 'pre'
  readonly workoutId: WorkoutId
  readonly recordedAt: string
  readonly recovery: Readonly<Partial<Record<MuscleGroup, RecoveryState>>>
  readonly readiness: ReadinessFactors
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

export interface PostWorkoutCheckIn {
  readonly id: CheckInId
  readonly kind: 'post'
  readonly workoutId: WorkoutId
  readonly recordedAt: string
  readonly workload: Readonly<Partial<Record<MuscleGroup, WorkloadState>>>
  /** Overall session RPE, 1–10. Optional; the per-muscle answers matter more. */
  readonly sessionRpe?: number
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

export type CheckIn = PreWorkoutCheckIn | PostWorkoutCheckIn

/* -------------------------------------------------------------------- */
/* Today's session                                                       */
/* -------------------------------------------------------------------- */

/*
 * **The readiness scoring is gone, and it never reached a session.**
 *
 * `sessionAdjustmentFor` returned a set multiplier and a sentence
 * explaining it, and the only thing that ever called it was its own
 * test — the same shape as `proposeLandmarks` before it, and the same
 * removal. What the comment here used to claim, that a bad night trims
 * the session, was never true of the shipped app.
 *
 * It is also not wanted. Sleep, nutrition and hydration are quantities
 * and belong in something that counts them; stress and motivation are a
 * mood, and a mood deciding how much you lift is a second
 * autoregulation competing with the one that works. RTS already answers
 * this set by set — reps at an RPE move the load on a bad day without
 * anybody rating the day first.
 *
 * `ReadinessFactors` stays because `PreWorkoutCheckIn` holds one. The
 * check-in is its own separate unwired feature and is not what was
 * removed here.
 */

/**
 * Muscles the lifter reported as still sore going into a session.
 *
 * Used to *suggest* dropping the accessory work for those muscles today.
 * A suggestion, not an edit: the lifter may know something the app does
 * not, and silently removing exercises is how an app loses trust.
 */
export function unrecoveredMuscles(checkIn: PreWorkoutCheckIn): readonly MuscleGroup[] {
  return (Object.keys(checkIn.recovery) as MuscleGroup[]).filter(
    (muscle) => checkIn.recovery[muscle] === 'not-recovered',
  )
}
