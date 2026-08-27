import { invariant } from '@/domain/errors/domain-error'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MAX_WEEKLY_DIRECT_SETS } from '@/domain/volume/frequency'
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
 * Starting landmarks for an intermediate lifter, in hard sets per week.
 *
 * These are defaults, not truths — individual recovery varies enormously,
 * and the whole point of the check-in loop is to move them. They are
 * deliberately conservative at the MEV end so a new user is not buried in
 * week one.
 */
/**
 * The published figures, before this app's own ceiling is applied.
 *
 * Kept separately and kept whole, because they are the citation: these
 * are roughly what RP publishes, and editing them in place to fit a
 * constraint of ours would lose the provenance and leave numbers nobody
 * could check. {@link DEFAULT_LANDMARKS} is these, clamped.
 */
const PUBLISHED_LANDMARKS: LandmarkSet = {
  chest: { mv: 4, mev: 8, mav: 16, mrv: 22 },
  'front-delts': { mv: 0, mev: 0, mav: 6, mrv: 12 },
  'side-delts': { mv: 6, mev: 8, mav: 19, mrv: 26 },
  'rear-delts': { mv: 0, mev: 6, mav: 16, mrv: 25 },
  triceps: { mv: 4, mev: 6, mav: 14, mrv: 20 },
  lats: { mv: 6, mev: 10, mav: 18, mrv: 25 },
  'upper-back': { mv: 6, mev: 10, mav: 20, mrv: 26 },
  /*
   * A low minimum effective volume, deliberately.
   *
   * The traps are the clearest case in the whole set of a muscle paid
   * mostly by work programmed for something else — every deadlift, row
   * and heavy carry loads them isometrically. RP publishes them this way
   * for the same reason, and it is why a lifter who has never done a
   * shrug still has traps.
   *
   * They were inside `upper-back` until it became clear that one number
   * was covering two regions: a barbell row and a barbell shrug were both
   * "upper back" while training almost nothing in common, so the row
   * satisfied a target the shrug was scheduled to fill.
   */
  traps: { mv: 0, mev: 4, mav: 12, mrv: 20 },
  biceps: { mv: 4, mev: 8, mav: 16, mrv: 22 },
  /*
   * Raised across the board when the pulls went into straps.
   *
   * These were low for the same reason the traps' are: nearly everything
   * paid them. Every deadlift, row, shrug and hang was grip work, so a
   * small direct ask was all it took to finish the job. Straps remove
   * that entirely — the lat and hamstring credit survives, the forearm
   * credit does not — and a landmark set against a source that no longer
   * exists is a target the week meets on paper with two sets of curls.
   *
   * At an MEV of 6 the forearms need direct work on two sessions rather
   * than one, which is what makes "once each way" schedulable at all:
   * flexors and extensors are different movements, and one session
   * cannot be both.
   */
  forearms: { mv: 2, mev: 6, mav: 14, mrv: 20 },
  quads: { mv: 6, mev: 8, mav: 16, mrv: 22 },
  hamstrings: { mv: 3, mev: 6, mav: 13, mrv: 18 },
  glutes: { mv: 0, mev: 4, mav: 10, mrv: 16 },
  calves: { mv: 6, mev: 8, mav: 16, mrv: 22 },
  core: { mv: 0, mev: 4, mav: 12, mrv: 20 },
}

/**
 * The published set, brought under what a week can actually deliver.
 *
 * Five direct sets a session on at most three sessions is fifteen, so
 * every landmark above fifteen describes volume this app will never
 * schedule. Leaving them published-high would mean a target nothing could
 * reach and a permanent shortfall on the Plan screen — a report that is
 * technically true, tells you nothing you can act on, and trains you to
 * ignore the screen.
 *
 * Clamped rather than rewritten so the relationship stays visible: the
 * quads read 22 in the literature and 15 here, and the reason is one
 * multiplication rather than an opinion about quads.
 *
 * The whole band comes down together, because `MV ≤ MEV ≤ MAV ≤ MRV` has
 * to keep holding — capping only the top would leave a MAV above its own
 * MRV.
 *
 * **MAV lands a set below MRV rather than on it.** Clamping both to
 * fifteen was the first attempt and it collapsed the gap `justUnder`
 * depends on: with MAV equal to MRV, a normal week's target *is* maximum
 * recoverable volume, which is the one thing the target is written never
 * to reach. A block with no room for a bad night ends early. So the top
 * of the adaptive band sits at fourteen and the recovery ceiling at
 * fifteen, which also keeps the hardest week deliverable — fourteen sets
 * across three sessions is 5/5/4.
 */
function underCeiling(marks: VolumeLandmarks): VolumeLandmarks {
  const mrv = Math.min(marks.mrv, MAX_WEEKLY_DIRECT_SETS)
  const mav = Math.min(marks.mav, mrv - 1)
  const mev = Math.min(marks.mev, mav)

  return { mv: Math.min(marks.mv, mev), mev, mav, mrv }
}

export const DEFAULT_LANDMARKS: LandmarkSet = Object.fromEntries(
  Object.entries(PUBLISHED_LANDMARKS).map(([muscle, marks]) => [muscle, underCeiling(marks)]),
) as LandmarkSet

/**
 * How much of a set "counts" toward a muscle that the exercise trains but
 * is not programmed for.
 *
 * A close-grip bench is a chest set and roughly half a triceps set. A
 * conventional deadlift is a hamstring/glute set and something less than
 * that for the upper back. Counting secondary work at full value inflates
 * every total and makes the landmarks meaningless; counting it at zero
 * is how lifters end up with twenty "real" triceps sets a week on top of
 * five pressing days.
 */
export const SECONDARY_SET_FRACTION = 0.5

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
