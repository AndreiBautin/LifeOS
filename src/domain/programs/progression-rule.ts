import type { ExerciseId } from '@/domain/ids/ids'

import type { SlotRole } from './program'

/**
 * Progression: how one cycle's prescription becomes the next one's.
 *
 * Both old apps hardcoded this. LiftTracker's volume ramp lived in an
 * `if (mesoWeek == 1) volume = 3; if (mesoWeek == 2) volume = 4;` chain
 * inside the session generator, and its RPE ramp in the expression
 * `9 - (3 - mesoWeek)`. Correct behaviour, unreachable by a user.
 * StrengthFlow's progression was a `+5` literal in an input handler.
 *
 * Expressed as data, the same machinery runs 5/3/1's training-max bump
 * and a Renaissance-Periodization volume ramp, and a user can edit either.
 */

/** Which slots a rule applies to. */
export type SlotSelector =
  | { readonly kind: 'all' }
  | { readonly kind: 'role'; readonly role: SlotRole }
  | { readonly kind: 'exercise'; readonly exerciseId: ExerciseId }
  | { readonly kind: 'slot'; readonly slotId: string }

/**
 * Whether a rule fires.
 *
 * `amrap-at-least` is the mechanism behind 5/3/1's autoregulation: the
 * final AMRAP set is a test, and passing or failing it decides whether
 * the training max moves up or is reset. Neither old app could express a
 * conditional progression at all.
 */
export type ProgressionCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'amrap-at-least'; readonly reps: number; readonly selector: SlotSelector }
  | { readonly kind: 'amrap-below'; readonly reps: number; readonly selector: SlotSelector }
  | { readonly kind: 'all-sets-completed'; readonly selector: SlotSelector }
  | { readonly kind: 'rpe-at-most'; readonly rpe: number; readonly selector: SlotSelector }

/** How much to change something by. */
export type Delta =
  | { readonly kind: 'absolute'; readonly amount: number }
  | { readonly kind: 'percent'; readonly amount: number }

export type ProgressionRule =
  /**
   * Move the training max. 5/3/1 in one rule: `+5` for upper-body lifts,
   * `+10` for lower-body, applied when a cycle completes.
   */
  | {
      readonly kind: 'adjust-training-max'
      readonly exercises: readonly ExerciseId[] | 'all'
      readonly delta: Delta
      readonly condition: ProgressionCondition
      readonly label: string
    }
  /**
   * Move the percentage a set prescribes. Boring But Big's supplemental
   * work climbing 50% → 60% across cycles is this rule.
   */
  | {
      readonly kind: 'adjust-load-percent'
      readonly selector: SlotSelector
      readonly deltaPercent: number
      readonly maxPercent?: number
      readonly condition: ProgressionCondition
      readonly label: string
    }
  /**
   * Move an absolute prescribed load — linear progression, and the
   * behaviour StrengthFlow implemented as a `+5` literal.
   */
  | {
      readonly kind: 'adjust-absolute-load'
      readonly selector: SlotSelector
      readonly delta: Delta
      readonly condition: ProgressionCondition
      readonly label: string
    }
  /**
   * Add or remove sets. This is LiftTracker's 3 → 4 → 5 volume ramp, and
   * it is what an autoregulated hypertrophy block runs on.
   */
  | {
      readonly kind: 'adjust-sets'
      readonly selector: SlotSelector
      readonly delta: number
      readonly minSets?: number
      readonly maxSets?: number
      readonly condition: ProgressionCondition
      readonly label: string
    }
  /** Move a rep target — double progression's second half. */
  | {
      readonly kind: 'adjust-reps'
      readonly selector: SlotSelector
      readonly delta: number
      readonly maxReps?: number
      readonly condition: ProgressionCondition
      readonly label: string
    }
  /**
   * Cut the training max back after a failed cycle. Wendler's prescribed
   * response to missing the minimum on an AMRAP set is a 10% reset, and
   * without it a program grinds a lifter into a wall.
   */
  | {
      readonly kind: 'reset-training-max'
      readonly exercises: readonly ExerciseId[] | 'all'
      readonly toPercent: number
      readonly condition: ProgressionCondition
      readonly label: string
    }

export function matchesSelector(
  selector: SlotSelector,
  slot: { readonly id: string; readonly role: SlotRole; readonly exerciseId?: ExerciseId },
): boolean {
  switch (selector.kind) {
    case 'all':
      return true
    case 'role':
      return slot.role === selector.role
    case 'exercise':
      return slot.exerciseId === selector.exerciseId
    case 'slot':
      return slot.id === selector.slotId
  }
}

export function applyDelta(value: number, delta: Delta): number {
  switch (delta.kind) {
    case 'absolute':
      return value + delta.amount
    case 'percent':
      return value * (1 + delta.amount / 100)
  }
}

export function describeRule(rule: ProgressionRule): string {
  return rule.label
}
