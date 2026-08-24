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
}

export type CheckIn = PreWorkoutCheckIn | PostWorkoutCheckIn

/* -------------------------------------------------------------------- */
/* Today's session                                                       */
/* -------------------------------------------------------------------- */

/**
 * How much to scale today's prescribed volume, given readiness.
 *
 * Temporary and session-scoped. Nothing here touches a landmark — a bad
 * night is not new information about training tolerance.
 */
export interface SessionAdjustment {
  readonly setMultiplier: number
  readonly reason: string
}

const READINESS_SCORE: Record<ReadinessLevel, number> = { poor: -1, ok: 0, good: 1 }

export function sessionAdjustmentFor(readiness: ReadinessFactors): SessionAdjustment {
  const factors = [
    readiness.sleep,
    readiness.nutrition,
    readiness.hydration,
    readiness.stress,
    readiness.motivation,
  ]
  const score = factors.reduce((sum, level) => sum + READINESS_SCORE[level], 0)

  if (score <= -3) {
    return {
      setMultiplier: 0.7,
      reason: 'Readiness is low across several factors — today is trimmed by roughly a third.',
    }
  }
  if (score <= -1) {
    return {
      setMultiplier: 0.85,
      reason: 'Readiness is a little down — a set has come off the back-off work.',
    }
  }
  if (score >= 4) {
    return {
      setMultiplier: 1.1,
      reason: 'Readiness is high — there is room for a little more if you want it.',
    }
  }
  return { setMultiplier: 1, reason: 'Readiness is normal — the session is as programmed.' }
}

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
