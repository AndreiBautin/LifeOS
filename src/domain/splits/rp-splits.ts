import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { StrengthLift } from '@/domain/priority/tiers'

/**
 * Splits for the RP/RTS model.
 *
 * Different from the 5/3/1 splits in one structural way: there are three
 * strength lifts, not four, and most days do not carry one. A day is
 * defined by the muscles it is accountable for; whether a competition
 * lift opens it is a separate question with an answer of "usually not".
 *
 * Every split here gives every trained muscle **at least twice-weekly
 * frequency**, which is the floor for splitting a weekly volume target
 * into sessions that are individually recoverable.
 */

export interface RpDay {
  readonly index: number
  readonly label: string
  /** Muscles this day is accountable for filling toward their weekly target. */
  readonly muscles: readonly MuscleGroup[]
  /** The competition lift that opens this day, if any. */
  readonly strengthLift?: StrengthLift
  /**
   * A hypertrophy lift this day is built around, placed before the debt
   * ordering gets a say.
   *
   * The overhead press is the case this exists for: it is heavy
   * hypertrophy rather than part of the total, its primary muscle sits in
   * the bottom tier, and a purely need-ordered filler would therefore
   * never select it — leaving a day called "upper, press" with no press
   * in it.
   */
  readonly featuredExercise?: string
  /** Which warm-up routine precedes it. */
  readonly warmUp: 'upper' | 'lower'
}

export interface RpSplit {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly daysPerWeek: number
  readonly days: readonly RpDay[]
}

const UPPER: readonly MuscleGroup[] = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'upper-back',
]

const LOWER: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core']

const PUSH: readonly MuscleGroup[] = ['chest', 'front-delts', 'side-delts', 'triceps']
const PULL: readonly MuscleGroup[] = ['lats', 'upper-back', 'rear-delts', 'biceps', 'forearms']

/**
 * The default, and the one that fits the training already logged.
 *
 * Four days, upper/lower, every muscle twice. Only three of the four days
 * carry a competition lift — Upper A is led by the overhead press, which
 * under this model is heavy hypertrophy rather than part of the total.
 * That is also, conveniently, the day already trained this week.
 */
const UPPER_LOWER_4: RpSplit = {
  id: 'rp-upper-lower-4',
  name: '4-day upper / lower',
  description:
    'Every muscle twice a week. Bench and squat lead the two middle days, the deadlift closes the week, and the press-led upper day carries no competition lift.',
  daysPerWeek: 4,
  days: [
    {
      index: 0,
      label: 'Upper — press',
      muscles: UPPER,
      featuredExercise: 'overhead-press',
      warmUp: 'upper',
    },
    { index: 1, label: 'Lower — squat', muscles: LOWER, strengthLift: 'squat', warmUp: 'lower' },
    { index: 2, label: 'Upper — bench', muscles: UPPER, strengthLift: 'bench', warmUp: 'upper' },
    {
      index: 3,
      label: 'Lower — deadlift',
      muscles: LOWER,
      strengthLift: 'deadlift',
      warmUp: 'lower',
    },
  ],
}

const FULL_BODY_2: RpSplit = {
  id: 'rp-full-body-2',
  name: '2-day full body',
  description: 'Two sessions, everything twice. The minimum that still hits every muscle twice.',
  daysPerWeek: 2,
  days: [
    {
      index: 0,
      label: 'Full body — squat',
      muscles: [...UPPER, ...LOWER],
      strengthLift: 'squat',
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Full body — bench and deadlift',
      muscles: [...UPPER, ...LOWER],
      strengthLift: 'bench',
      warmUp: 'lower',
    },
  ],
}

const FULL_BODY_3: RpSplit = {
  id: 'rp-full-body-3',
  name: '3-day full body',
  description: 'Three full-body sessions, one competition lift each.',
  daysPerWeek: 3,
  days: [
    {
      index: 0,
      label: 'Full body — squat',
      muscles: [...UPPER, ...LOWER],
      strengthLift: 'squat',
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Full body — bench',
      muscles: [...UPPER, ...LOWER],
      strengthLift: 'bench',
      warmUp: 'upper',
    },
    {
      index: 2,
      label: 'Full body — deadlift',
      muscles: [...UPPER, ...LOWER],
      strengthLift: 'deadlift',
      warmUp: 'lower',
    },
  ],
}

const UPPER_LOWER_5: RpSplit = {
  id: 'rp-upper-lower-5',
  name: '5-day upper / lower / arms',
  description:
    'Upper, lower, upper, lower, then a dedicated arms and delts day — which is where a tier-1 arm specialisation earns its keep.',
  daysPerWeek: 5,
  days: [
    {
      index: 0,
      label: 'Upper — press',
      muscles: UPPER,
      featuredExercise: 'overhead-press',
      warmUp: 'upper',
    },
    { index: 1, label: 'Lower — squat', muscles: LOWER, strengthLift: 'squat', warmUp: 'lower' },
    { index: 2, label: 'Upper — bench', muscles: UPPER, strengthLift: 'bench', warmUp: 'upper' },
    {
      index: 3,
      label: 'Lower — deadlift',
      muscles: LOWER,
      strengthLift: 'deadlift',
      warmUp: 'lower',
    },
    {
      index: 4,
      label: 'Arms and delts',
      muscles: ['biceps', 'triceps', 'forearms', 'side-delts', 'rear-delts'],
      warmUp: 'upper',
    },
  ],
}

const PPL_6: RpSplit = {
  id: 'rp-ppl-6',
  name: '6-day push / pull / legs',
  description:
    'Two rotations of push, pull and legs. The highest frequency the schedule allows, and the most room for a specialisation block.',
  daysPerWeek: 6,
  days: [
    { index: 0, label: 'Push — bench', muscles: PUSH, strengthLift: 'bench', warmUp: 'upper' },
    { index: 1, label: 'Pull', muscles: PULL, warmUp: 'upper' },
    { index: 2, label: 'Legs — squat', muscles: LOWER, strengthLift: 'squat', warmUp: 'lower' },
    { index: 3, label: 'Push', muscles: PUSH, warmUp: 'upper' },
    { index: 4, label: 'Pull', muscles: PULL, warmUp: 'upper' },
    {
      index: 5,
      label: 'Legs — deadlift',
      muscles: LOWER,
      strengthLift: 'deadlift',
      warmUp: 'lower',
    },
  ],
}

export const RP_SPLITS: readonly RpSplit[] = [
  FULL_BODY_2,
  FULL_BODY_3,
  UPPER_LOWER_4,
  UPPER_LOWER_5,
  PPL_6,
]

export function rpSplitForDays(daysPerWeek: number): RpSplit {
  const found = RP_SPLITS.find((split) => split.daysPerWeek === daysPerWeek)
  // The four-day upper/lower is the fallback because it is the shape that
  // satisfies twice-weekly frequency with the least scheduling friction.
  return found ?? UPPER_LOWER_4
}

/** How many of a week's sessions train a given muscle. */
export function rpFrequency(split: RpSplit, muscle: MuscleGroup): number {
  return split.days.filter((day) => day.muscles.includes(muscle)).length
}
