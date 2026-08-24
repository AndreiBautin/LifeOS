import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import type { LandmarkSet, VolumeLandmarks } from '@/domain/volume/landmarks'
import { validateLandmarks } from '@/domain/volume/landmarks'

import type { CheckIn, RecoveryState, WorkloadState } from './check-in'

/**
 * Turning check-in history into a proposal to move a volume landmark.
 *
 * Three rules govern this, and each one is a direct answer to something
 * StrengthFlow got wrong:
 *
 *   1. **Evidence accumulates.** A single "still sore" is noise. The
 *      proposal only fires once a muscle has produced a consistent signal
 *      across `MINIMUM_OBSERVATIONS` sessions, so one bad week does not
 *      rewrite a program. StrengthFlow acted on every answer immediately.
 *
 *   2. **The band is respected.** Adjustments move MAV — the working
 *      target — and are clamped so the ordering MV ≤ MEV ≤ MAV ≤ MRV
 *      always holds. StrengthFlow's counter had no bounds at all and
 *      could reach zero or run away.
 *
 *   3. **Nothing applies silently.** Every proposal carries the evidence
 *      that produced it and is returned for review. The lifter accepts or
 *      declines; the check-ins remain either way, so the decision is
 *      reversible.
 */

/** Sessions of evidence needed before a landmark is proposed for change. */
export const MINIMUM_OBSERVATIONS = 3

/** The largest single step, in sets. Landmarks move slowly on purpose. */
export const MAX_ADJUSTMENT = 2

export interface LandmarkProposal {
  readonly muscle: MuscleGroup
  readonly current: VolumeLandmarks
  readonly proposed: VolumeLandmarks
  readonly deltaMav: number
  readonly reason: string
  /** Check-ins the proposal rests on, so the lifter can see the evidence. */
  readonly observations: number
}

const RECOVERY_SIGNAL: Record<RecoveryState, number> = {
  // Still sore when the next session comes round: the last dose was more
  // than could be recovered from.
  'not-recovered': -1,
  'recovered-on-time': 0,
  // Recovered well before the next session: there was room for more.
  'recovered-early': 1,
}

const WORKLOAD_SIGNAL: Record<WorkloadState, number> = {
  easy: 1,
  moderate: 0,
  hard: 0,
  'too-much': -1,
}

interface Signal {
  readonly total: number
  readonly count: number
}

/**
 * Reads a run of check-ins and proposes landmark changes.
 *
 * Only muscles with enough evidence and a consistent direction produce a
 * proposal; everything else is left alone, which is the common case and
 * should be.
 */
export function proposeLandmarkAdjustments(
  landmarks: LandmarkSet,
  checkIns: readonly CheckIn[],
): readonly LandmarkProposal[] {
  const signals = collectSignals(checkIns)
  const proposals: LandmarkProposal[] = []

  for (const muscle of MUSCLE_GROUPS) {
    const signal = signals[muscle]
    if (signal === undefined || signal.count < MINIMUM_OBSERVATIONS) continue

    // The average, so a muscle observed twice as often does not move
    // twice as fast.
    const average = signal.total / signal.count
    const step = Math.round(average * MAX_ADJUSTMENT)
    if (step === 0) continue

    const current = landmarks[muscle]
    const proposed = shiftMav(current, step, muscle)
    if (proposed.mav === current.mav) continue

    proposals.push({
      muscle,
      current,
      proposed,
      deltaMav: proposed.mav - current.mav,
      reason: explain(muscle, step, signal.count),
      observations: signal.count,
    })
  }

  return proposals
}

function collectSignals(checkIns: readonly CheckIn[]): Partial<Record<MuscleGroup, Signal>> {
  const signals: Partial<Record<MuscleGroup, Signal>> = {}

  const add = (muscle: MuscleGroup, value: number): void => {
    const existing = signals[muscle] ?? { total: 0, count: 0 }
    signals[muscle] = { total: existing.total + value, count: existing.count + 1 }
  }

  for (const checkIn of checkIns) {
    if (checkIn.kind === 'pre') {
      for (const muscle of Object.keys(checkIn.recovery) as MuscleGroup[]) {
        const state = checkIn.recovery[muscle]
        if (state !== undefined) add(muscle, RECOVERY_SIGNAL[state])
      }
    } else {
      for (const muscle of Object.keys(checkIn.workload) as MuscleGroup[]) {
        const state = checkIn.workload[muscle]
        if (state !== undefined) add(muscle, WORKLOAD_SIGNAL[state])
      }
    }
  }

  return signals
}

/**
 * Moves the adaptive target by `step` sets, keeping the band ordered.
 *
 * MAV is what changes: it is the number the weekly ramp climbs toward, so
 * moving it is what actually alters training. MRV rises with it when
 * pushed against the ceiling, because a lifter who keeps recovering early
 * at their maximum has demonstrated the ceiling was too low. MEV never
 * moves from a check-in — the minimum that produces growth is not
 * something a soreness rating measures.
 */
function shiftMav(current: VolumeLandmarks, step: number, muscle: MuscleGroup): VolumeLandmarks {
  const desired = current.mav + step

  // A lifter who keeps recovering early while already at their ceiling
  // has demonstrated the ceiling was too low, so it rises with them.
  // Downward pressure never lowers MRV — that is a limit discovered by
  // exceeding it, not by staying under it.
  const mrv = step > 0 && desired > current.mrv ? desired : current.mrv
  const mav = clamp(desired, current.mev, mrv)

  const next: VolumeLandmarks = { ...current, mav, mrv }

  // A proposal that violates the ordering is a bug, not a valid outcome.
  validateLandmarks(next, muscle)
  return next
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(Math.round(value), low), high)
}

function explain(muscle: MuscleGroup, step: number, observations: number): string {
  const sessions = `${String(observations)} session${observations === 1 ? '' : 's'}`
  return step > 0
    ? `${muscle} has been recovering early or reporting easy workloads across ${sessions}. There is room for ${String(step)} more set${step === 1 ? '' : 's'} a week.`
    : `${muscle} has been arriving sore or reporting too much work across ${sessions}. Cutting ${String(Math.abs(step))} set${step === -1 ? '' : 's'} a week should let it recover.`
}

/** Applies accepted proposals, leaving everything else untouched. */
export function applyProposals(
  landmarks: LandmarkSet,
  accepted: readonly LandmarkProposal[],
): LandmarkSet {
  if (accepted.length === 0) return landmarks

  const next: Record<MuscleGroup, VolumeLandmarks> = { ...landmarks }
  for (const proposal of accepted) {
    next[proposal.muscle] = proposal.proposed
  }
  return next
}
