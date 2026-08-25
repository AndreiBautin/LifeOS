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
   * Exercises this day is built around, placed in order before the debt
   * ordering gets a say.
   *
   * Two jobs. The overhead press needs one because it is heavy
   * hypertrophy whose primary muscle sits in the bottom tier — pure
   * need-ordering would never select it, leaving a day called "upper,
   * press" with no press in it. And a day can be pinned to what a lifter
   * actually trains, so a generated block continues the session they just
   * did rather than proposing a different one.
   */
  readonly anchors?: readonly string[]
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

/**
 * Small muscles that appear on **every** day, upper and lower alike.
 *
 * Two things fall out of this, and both are the point.
 *
 * Frequency: these are the tier-1 specialisation targets, they recover
 * fast, and spreading a high weekly target across four sessions rather
 * than two keeps each session recoverable — which is the whole reason a
 * weekly target gets split at all.
 *
 * Balance: with legs maintained and arms specialised, an upper/lower
 * split puts almost all the accessory work on two of the four days. Those
 * days run past seventy-five minutes while the lower days finish in
 * thirty, and the *average* then trips the frequency autoregulator into
 * recommending fewer sessions — which would be exactly the wrong move.
 * Curls and lateral raises cost almost nothing systemically, so they are
 * the right things to move.
 */
const SMALL_EVERY_DAY: readonly MuscleGroup[] = ['biceps', 'triceps', 'forearms', 'side-delts']

/** Big upper muscles, which stay on upper days where the pressing is. */
const UPPER: readonly MuscleGroup[] = [
  'chest',
  'front-delts',
  'rear-delts',
  'lats',
  'upper-back',
  ...SMALL_EVERY_DAY,
]

const LOWER: readonly MuscleGroup[] = [
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  ...SMALL_EVERY_DAY,
]

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
      // Pinned to the session already trained this week: press, pull-ups,
      // curls, lateral raises. Anchoring it keeps the block continuous
      // with what was actually done, and keeps this day short enough that
      // the accessory budget reaches the lower days.
      anchors: ['overhead-press', 'pull-up', 'db-curl', 'db-lateral-raise'],
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
      anchors: ['overhead-press', 'pull-up'],
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
