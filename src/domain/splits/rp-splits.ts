import type { MuscleGroup } from '@/domain/exercises/taxonomy'

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
  /**
   * The day's name only — "Monday", "Full body".
   *
   * What the day *contains* is appended when the block is assembled,
   * because it is not knowable here. A hardcoded "press and pull" was
   * wrong the moment a tier moved and the fill changed underneath it, and
   * a label that describes a different session from the one on screen is
   * worse than no label.
   */
  readonly label: string
  /** Muscles this day is accountable for filling toward their weekly target. */
  readonly muscles: readonly MuscleGroup[]
  /**
   * Which half of the body's competition lifts this day can open.
   *
   * The day says what it is *able* to host; which lifts actually land on
   * it is derived from the strength tiers — a prioritised lift gets more
   * sessions and therefore appears on more of the eligible days. See
   * `strengthSessionsFor`.
   *
   * Naming a single lift per day was the old shape, and it made the
   * split the place where "how often do I bench" was decided. That is a
   * priority question, and priority already lives in the tiers. Now
   * promoting the bench changes how often it is benched without anyone
   * editing a day.
   */
  readonly carries?: readonly ('upper' | 'lower')[]
  /**
   * Conditioning to close the day, as exercise slugs.
   *
   * Placed on days rather than left to the lifter because conditioning
   * that is not programmed does not happen, and because *which* day it
   * lands on is the entire question — a hard interval session the day
   * before a deadlift is paid for out of the deadlift.
   */
  readonly conditioning?: readonly string[]
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
 * Upper is upper and lower is lower.
 *
 * The arms and side delts used to be accountable on **every** day, on
 * the reasoning that they are the specialisation targets, they recover
 * fast, and spreading their volume wide keeps each session recoverable.
 * The frequency that argument was reaching for now comes from the volume
 * itself (`domain/volume/frequency.ts`) rather than from the split, and
 * with it gone what was left was the cost: a deadlift day carrying
 * curls, an upright row and a wrist curl after a heavy pull, because the
 * day was accountable for muscles it had no business finishing.
 *
 * So the three upper days carry the whole upper body between them. A
 * specialised muscle needs three sessions and there are exactly three to
 * have; a maintained one needs two and takes two of the three. Nobody
 * has to say which two — the fill orders by how far behind each muscle
 * is against its own required frequency, and the answer falls out.
 */
const UPPER: readonly MuscleGroup[] = [
  'chest',
  'front-delts',
  'rear-delts',
  'lats',
  'upper-back',
  'biceps',
  'triceps',
  'forearms',
  'side-delts',
]

/**
 * Core lives here rather than on upper days.
 *
 * It is trained by the squat and the deadlift whether or not anything
 * asks it to be, so the days it is already braced on are the days its
 * direct work belongs on — and putting it upstairs would mean bracing
 * hard on Tuesday and then again on Wednesday for no reason.
 */
const LOWER: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core']

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
      carries: ['upper', 'lower'],
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Full body — bench and deadlift',
      muscles: [...UPPER, ...LOWER],
      carries: ['upper', 'lower'],
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
      carries: ['upper', 'lower'],
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Full body — bench',
      muscles: [...UPPER, ...LOWER],
      carries: ['upper', 'lower'],
      warmUp: 'upper',
    },
    {
      index: 2,
      label: 'Full body — deadlift',
      muscles: [...UPPER, ...LOWER],
      carries: ['upper', 'lower'],
      warmUp: 'lower',
    },
  ],
}

/**
 * The default: five days, Monday to Friday, weekends off.
 *
 * Five rather than four or six because of what the session lengths do at
 * either end. Four days has to carry the whole week's volume in four
 * sittings, and with arms specialised the upper days ran past seventy-five
 * minutes while the lower days finished in thirty. Six days divides the
 * same volume so finely that several sessions are barely worth the trip.
 * Five splits the difference and lands every day near the target.
 *
 * The weekday labels are deliberate. The program is still a queue rather
 * than a calendar — nothing advances until a session is finished or
 * skipped — but naming the days is what makes a five-day week legible as
 * a working week, and it is how the schedule is actually lived.
 */
const WEEK_5: RpSplit = {
  id: 'rp-week-5',
  name: '5-day Monday to Friday',
  description:
    'Upper, lower, upper, lower, upper. Every day opens with competition lifting; how much of it depends on what is prioritised. Weekends off.',
  daysPerWeek: 5,
  days: [
    {
      index: 0,
      label: 'Monday',
      muscles: UPPER,
      carries: ['upper'],
      warmUp: 'upper',
    },
    {
      index: 1,
      label: 'Tuesday',
      muscles: LOWER,
      carries: ['lower'],
      /*
       * Conditioning lives on the lower days, and this is the balancing
       * decision rather than a training one.
       *
       * The upper days carry the whole upper body and run to eighty
       * minutes; the lower days carry a maintained lower body and finish
       * in forty. Twenty minutes of conditioning on an upper day makes
       * the long day longer. Moved down, it evens the week out.
       *
       * Swings follow the squat rather than the deadlift: they are a
       * hinge, and stacking a hinge on the heaviest hinge of the week is
       * the one pairing worth avoiding.
       */
      conditioning: ['kb-swing'],
      warmUp: 'lower',
    },
    {
      index: 2,
      label: 'Wednesday',
      muscles: UPPER,
      carries: ['upper'],
      warmUp: 'upper',
    },
    {
      index: 3,
      label: 'Thursday',
      muscles: LOWER,
      carries: ['lower'],
      // The walk costs nothing and asks nothing, which is what belongs
      // after the heaviest pull of the week.
      conditioning: ['incline-walk'],
      warmUp: 'lower',
    },
    {
      index: 4,
      label: 'Friday',
      /*
       * Accountable for the whole upper body, not only for arms.
       *
       * A dedicated arms day sounds right for an arm specialisation and
       * is the reason this day once came out at twenty-four minutes: the
       * arms are trained across the week, so by Friday their target is
       * nearly spent and a day that can *only* draw on them has nothing
       * left to do. Opening it to the upper body gives it somewhere to
       * put the time.
       */
      muscles: UPPER,
      carries: ['upper'],
      warmUp: 'upper',
    },
  ],
}

export const RP_SPLITS: readonly RpSplit[] = [FULL_BODY_2, FULL_BODY_3, WEEK_5]

export function rpSplitForDays(daysPerWeek: number): RpSplit {
  const found = RP_SPLITS.find((split) => split.daysPerWeek === daysPerWeek)
  // The five-day week is the fallback because it is the shape whose
  // sessions come out closest to the target length at both ends.
  return found ?? WEEK_5
}

/** How many of a week's sessions train a given muscle. */
export function rpFrequency(split: RpSplit, muscle: MuscleGroup): number {
  return split.days.filter((day) => day.muscles.includes(muscle)).length
}
