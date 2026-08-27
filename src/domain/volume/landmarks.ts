import { invariant } from '@/domain/errors/domain-error'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'

/**
 * Renaissance-Periodization volume landmarks, per muscle group.
 *
 * The idea both old apps were circling without ever naming. ProgramBuilder
 * had a single `MuscleGroup.WeeklyVolume` integer; StrengthFlow had a
 * per-muscle `volume` document that its check-ins incremented and
 * decremented with no bounds, no history, and no way back. A single
 * number cannot express "this is the least that produces growth" and
 * "this is the most I can recover from" at the same time, which is why
 * StrengthFlow's autoregulation could walk a muscle's volume to zero or
 * to nonsense and never notice.
 *
 *   MV   maintenance volume     — holds what you have
 *   MEV  minimum effective      — the least that grows anything
 *   MAV  maximum adaptive       — the productive working band
 *   MRV  maximum recoverable    — past here you accumulate fatigue, not size
 *
 * A mesocycle ramps from around MEV toward MRV and then deloads. That
 * ramp is LiftTracker's hardcoded 3 → 4 → 5 → 2 set progression, stated
 * as a principle instead of as an `if` chain, and it now adapts to the
 * muscle rather than applying one number to every exercise in the program.
 */
export interface VolumeLandmarks {
  readonly mv: number
  readonly mev: number
  readonly mav: number
  readonly mrv: number
}

export type LandmarkSet = Readonly<Record<MuscleGroup, VolumeLandmarks>>

export function validateLandmarks(landmarks: VolumeLandmarks, muscle: MuscleGroup): void {
  invariant(
    landmarks.mv <= landmarks.mev &&
      landmarks.mev <= landmarks.mav &&
      landmarks.mav <= landmarks.mrv,
    'LANDMARKS_OUT_OF_ORDER',
    `Volume landmarks for ${muscle} must be ordered MV ≤ MEV ≤ MAV ≤ MRV, received ${String(landmarks.mv)}/${String(landmarks.mev)}/${String(landmarks.mav)}/${String(landmarks.mrv)}.`,
  )
  invariant(
    Number.isInteger(landmarks.mv) && landmarks.mv >= 0,
    'LANDMARKS_NEGATIVE',
    `Volume landmarks for ${muscle} must be non-negative whole numbers of sets.`,
  )
}

/**
 * Starting landmarks, in hard sets per week — the same for every muscle.
 *
 * Two, six and ten. This replaced a per-muscle table derived from RP's
 * published figures through two corrections: a two-thirds factor turning
 * total volume into direct-only volume, and a clamp bringing everything
 * under what a week could schedule. Both were defensible and the result
 * was fifteen rows of numbers whose provenance took three paragraphs to
 * explain and which nobody could sanity-check by looking at them.
 *
 * What the flat numbers cost is real: the side delts and the calves
 * recover faster than the quads and could take more, and this says they
 * cannot. That is a worse model and a far more legible one, and legibility
 * is what makes the tier list mean anything — "tier 2 is six sets, twice a
 * week, three each" is a sentence you can hold in your head while deciding
 * where to put a muscle. Per-muscle numbers are the thing to reintroduce
 * *from evidence*, one muscle at a time, once the check-in loop has
 * produced some; that is what `adjust-landmarks.ts` is for.
 *
 * MAV is the odd one out and is no longer read when computing a target —
 * see {@link weeklyTargetForMember}, which uses MRV, MEV or nothing at all
 * depending on tier. It survives because the check-in loop moves it, and
 * moving it upward past MRV is what raises MRV: a lifter who keeps
 * recovering early at their ceiling has shown the ceiling was too low.
 */
export const STARTING_LANDMARKS: VolumeLandmarks = { mv: 2, mev: 6, mav: 8, mrv: 10 }

export const DEFAULT_LANDMARKS: LandmarkSet = Object.fromEntries(
  MUSCLE_GROUPS.map((muscle) => [muscle, STARTING_LANDMARKS]),
) as LandmarkSet

/**
 * The target number of sets for a muscle in a given week of a mesocycle.
 *
 * Ramps MEV → MAV across the working weeks, then drops to roughly MV on
 * the deload. This is LiftTracker's 3/4/5/2 generalised: with a 4-week
 * block and chest landmarks of 8/16, it produces 8 → 11 → 14 → 4 rather
 * than the same 3/4/5/2 applied to every muscle in the program
 * regardless of size or recovery.
 *
 * The ramp stops at MAV, not MRV. MRV is a ceiling to stay under, not a
 * target to hit — running a planned block into it is how a mesocycle ends
 * early.
 */
export function targetSetsForWeek(
  landmarks: VolumeLandmarks,
  weekIndex: number,
  totalWorkingWeeks: number,
  isDeload: boolean,
): number {
  if (isDeload) return Math.max(0, Math.round(landmarks.mv))
  if (totalWorkingWeeks <= 1) return Math.round(landmarks.mev)

  const progress = Math.min(weekIndex, totalWorkingWeeks - 1) / (totalWorkingWeeks - 1)
  const target = landmarks.mev + (landmarks.mav - landmarks.mev) * progress
  return Math.max(0, Math.round(target))
}

/** Clamps a proposed weekly volume into the recoverable band. */
export function clampToLandmarks(sets: number, landmarks: VolumeLandmarks): number {
  return Math.min(Math.max(Math.round(sets), 0), landmarks.mrv)
}

export function emptyVolumeMap(): Record<MuscleGroup, number> {
  return Object.fromEntries(MUSCLE_GROUPS.map((muscle) => [muscle, 0])) as Record<
    MuscleGroup,
    number
  >
}
