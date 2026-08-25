import type { Equipment } from './taxonomy'

/**
 * What a set of an exercise costs, and what it buys.
 *
 * Renaissance Periodization's central practical claim is that not all
 * sets are equal: a set of cable lateral raises and a set of deadlifts
 * both count as "one set" in a spreadsheet, and they are nothing alike in
 * what they take out of you. Modelling that difference is what lets the
 * app say "you are at 18 sets for quads but you are also three heavy
 * deadlift sessions deep, so the number is lying to you".
 */

/**
 * Stimulus-to-fatigue ratio, 1–5, where 5 is the best deal.
 *
 * High-SFR work gives a lot of muscular stimulus for very little systemic
 * or joint cost — a stable position, a good stretch, no spinal loading,
 * and failure that is merely unpleasant rather than dangerous. Low-SFR
 * work is still worth doing, but it should be *spent* deliberately rather
 * than accumulated by accident.
 *
 * This is what makes prioritisation meaningful. Pushing a muscle toward
 * MRV is only affordable if the sets getting it there are cheap ones.
 */
export type Sfr = 1 | 2 | 3 | 4 | 5

/**
 * Whole-body fatigue cost per working set, in arbitrary units where a
 * heavy compound squat set is 1.0 and a seated isolation set is near 0.
 *
 * Deliberately *not* per-muscle. Local fatigue is already captured by
 * volume against a muscle's landmarks; this is the thing landmarks cannot
 * see — the reason six sets of squats and six sets of leg extensions
 * leave you in completely different states despite identical quad volume.
 */
export type SystemicCost = number

export const SYSTEMIC_COST_BY_EQUIPMENT: Record<Equipment, number> = {
  barbell: 0.55,
  smith: 0.4,
  dumbbell: 0.3,
  kettlebell: 0.35,
  machine: 0.2,
  cable: 0.15,
  bodyweight: 0.25,
  band: 0.1,
  'ez-bar': 0.2,
  other: 0.2,
}

/**
 * How a lifter should treat the exercise, which is not the same as what
 * rep range it lives in.
 *
 * The distinction the redesign turns on: the powerlifting total is three
 * lifts, and everything else — including a heavy overhead press at three
 * to six reps — is hypertrophy work that happens to be heavy. Strength
 * work is autoregulated by RTS fatigue percents against an estimated max;
 * hypertrophy work is prescribed at a constant proximity to failure and
 * governed by volume landmarks.
 */
export const TRAINING_INTENTS = ['strength', 'hypertrophy', 'conditioning'] as const
export type TrainingIntent = (typeof TRAINING_INTENTS)[number]

export const TRAINING_INTENT_LABELS: Record<TrainingIntent, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  conditioning: 'Conditioning',
}

/**
 * Whether the final work set should be taken to failure.
 *
 * Covers two different reasons to say no, and they are worth keeping
 * together because the answer is the same either way:
 *
 *   - **Physical danger.** A failed flat bench in a garage with no
 *     spotter is a genuine emergency. A failed lateral raise is a
 *     dumbbell on the floor.
 *   - **Disproportionate cost.** Taking a deadlift to failure is
 *     survivable and still a bad idea; the fatigue vastly outruns the
 *     extra stimulus, and form degrades exactly where it matters most.
 *
 * Only exercises marked `true` get a to-failure last set.
 */
export type FailureSafety = boolean

/**
 * The RPE at which every hypertrophy work set is prescribed.
 *
 * One rep in reserve, held constant — no ramp across the block. Ramping
 * RPE and ramping volume at the same time makes it impossible to tell
 * which one drove a stall, and proximity to failure is the variable with
 * the least room to move: below about 2 RIR the stimulus falls off a
 * cliff, and at 0 RIR the fatigue does not justify itself on most sets.
 */
export const HYPERTROPHY_RIR = 1
export const HYPERTROPHY_RPE = 10 - HYPERTROPHY_RIR

/** The rep band a heavy hypertrophy lift like the overhead press lives in. */
export const HEAVY_HYPERTROPHY_REPS = { low: 3, high: 6 } as const
