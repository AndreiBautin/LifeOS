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
   * Muscles this day will take **only if the days that own them cannot**.
   *
   * Upper work on a lower day, and the reason it is a separate list
   * rather than more entries in `muscles`. A five-day upper/lower/upper/
   * lower/upper week has three sessions to spend the whole upper body in,
   * and a specialised set of arms and side delts asks for more sets than
   * three seventy-minute sessions hold. Something has to give: either the
   * targets come down or the leftovers land somewhere.
   *
   * Listing them as ordinary accountability was the old answer, and it
   * put curls and an upright row after a heavy deadlift because Thursday
   * was as entitled to them as Monday. As overflow the deadlift day fills
   * its own legs and core first, and only reaches for the arms with the
   * time it has left over — which is the difference between a leg day
   * that ends with a few cheap sets and a leg day with an arm workout
   * stapled to it.
   */
  readonly overflowMuscles?: readonly MuscleGroup[]
  /** The competition lift that opens this day, if any. */
  readonly strengthLift?: StrengthLift
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

/**
 * What a lower day picks up when the upper days run out of room.
 *
 * The small, cheap, fast-recovering ones only. A lateral raise or a curl
 * at the end of a leg day costs nothing and is a real set; a row or a
 * press there would be a second workout.
 */
const UPPER_OVERFLOW: readonly MuscleGroup[] = ['side-delts', 'biceps', 'triceps', 'forearms']

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
    'Upper, lower, upper, lower, upper. A competition lift opens three of the five; the other two are pure hypertrophy. Weekends off.',
  daysPerWeek: 5,
  days: [
    /*
     * Monday and Friday are the two days with no competition lift, and
     * they are what makes the upper-body volume reachable: three upper
     * sessions have to carry the whole upper body, and one of them has a
     * bench press and its back-offs in it already.
     *
     * Neither is pinned to an exercise list any more. They used to be —
     * Monday to a press, pull-ups, lateral raises and curls, Friday to
     * dips, rows and a curl — which made them a transcript of a session
     * actually trained rather than a shape derived from the tiers. Two
     * things were wrong with that. The exercises stopped matching the
     * tiers the moment a tier moved, which is the failure the whole app
     * is built to avoid. And an overhead press pinned to Monday survived
     * the front delts falling to maintenance, so a day was spending its
     * most expensive slot on a muscle asking for nothing.
     */
    {
      index: 0,
      label: 'Monday',
      muscles: UPPER,
      // The easiest conditioning after two rest days, and the cheapest
      // to place: a walk costs the week nothing wherever it lands.
      conditioning: ['incline-walk'],
      warmUp: 'upper',
    },
    {
      index: 1,
      label: 'Tuesday',
      muscles: LOWER,
      overflowMuscles: UPPER_OVERFLOW,
      strengthLift: 'squat',
      warmUp: 'lower',
    },
    {
      index: 2,
      label: 'Wednesday',
      muscles: UPPER,
      strengthLift: 'bench',
      /*
       * The run goes here rather than on a lower day.
       *
       * It has to go on an upper day — a run stacked onto squats or
       * deadlifts is leg volume the planner did not budget for — and of
       * the three, Wednesday is the one whose own work is upper-body
       * pressing. Monday already has the walk, and Friday takes the
       * swings.
       */
      conditioning: ['running'],
      warmUp: 'upper',
    },
    {
      index: 3,
      label: 'Thursday',
      muscles: LOWER,
      overflowMuscles: UPPER_OVERFLOW,
      strengthLift: 'deadlift',
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
       * put the time — the arms still lead it, because they are owed the
       * most, and the back and chest fill in behind them.
       */
      muscles: UPPER,
      // The hardest conditioning goes here: it is the last session before
      // two rest days, so there is nothing left in the week for it to
      // compromise. Swings on a Wednesday would be paid for on Thursday's
      // deadlift.
      conditioning: ['kb-swing'],
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
