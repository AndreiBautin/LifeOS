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
  /**
   * What the day *is* — "Upper 1", "Lower 2".
   *
   * The label used to be followed by the kinds of work present, which
   * stopped saying anything once every day carried strength, hypertrophy
   * and conditioning: "Strength, Hypertrophy and Conditioning" on all four
   * days is a heading that distinguishes nothing. Which half of the body
   * it is, and which time through, is the thing you actually want to know
   * on Thursday morning.
   */
  readonly focusName: string
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
/**
 * The upper body divided between the two upper days, rather than both
 * days being accountable for all of it.
 *
 * Reported as *"I'm noticing redundancy in the exercises — don't repeat
 * dips or lateral raises on both upper days."* They were repeated, and
 * the cause is one line further in: with one exercise per muscle per
 * session, a muscle listed on both upper days gets two slots, and the
 * chest's hypertrophy pool holds exactly one movement. So it filled both
 * with dips. The same for the lateral raise, the row, the pull-up and the
 * rear delt raise.
 *
 * **A muscle's accessory work sits on the day whose competition lift does
 * not already train it**, which is the reason given with the report —
 * *"since there's overlap"* — and is what makes this a pairing rather
 * than an arbitrary dealing-out of muscles into two piles:
 *
 * - **The chest is benched on `UPPER_1`, so dips are on `UPPER_2`.** Three
 *   heavy sets of bench and then dips is the same muscle twice in one
 *   session; on the press day the chest gets nothing else.
 * - **The side delts are pressed on `UPPER_2`, so lateral raises are on
 *   `UPPER_1`.** The mirror of the above, and the two together are why
 *   the pairing is stated as overlap rather than as balance.
 * - **A horizontal pull against the horizontal press, a vertical pull
 *   against the vertical press.** The row is on the bench day and the
 *   pull-up on the press day, which is the ordinary antagonist pairing
 *   and settles a question the report left open.
 * - **Rear delt work goes on the day without the row**, asked for
 *   directly: a barbell row pays the rear delts on the way past, so
 *   isolating them in the same session is the third instance of the same
 *   overlap.
 * - **The traps go with the row and the forearms with the pulling**, for
 *   the same reason, though both are at zero sessions and neither is
 *   scheduled. The forearms have nothing left in the catalogue at all.
 *
 * **Which day carries which lift is derived, not written here**, and that
 * is the seam to know about. `assignStrengthLifts` places the bench and
 * the press onto the eligible days; these lists assume the bench lands on
 * `UPPER_1`, which it does because the lifts are placed in
 * `STRENGTH_LIFTS` order onto the emptiest eligible day and the session
 * counts are constants. If either of those changes the pairing inverts
 * silently — the week would still hold one of each exercise, and each
 * would be on the wrong day. `rp-assemble.test.ts` → "pairs each muscle
 * against the lift that does not already train it" is what watches it.
 */
const UPPER_1: readonly MuscleGroup[] = [
  'side-delts',
  'upper-back',
  'traps',
  'forearms',
  'biceps',
  'triceps',
]

const UPPER_2: readonly MuscleGroup[] = [
  'chest',
  'lats',
  'rear-delts',
  'front-delts',
  'biceps',
  'triceps',
]

/**
 * Core lives here rather than on upper days.
 *
 * It is trained by the squat and the deadlift whether or not anything
 * asks it to be, so the days it is already braced on are the days its
 * direct work belongs on — and putting it upstairs would mean bracing
 * hard on Tuesday and then again on Wednesday for no reason.
 */
/**
 * The lower body divided between the two lower days, the way the upper
 * body already is.
 *
 * Asked for as _"only do calf raises on deadlift day and only do
 * kettlebell swings on squat day."_ Both were on both days — the calves
 * because they were the one muscle set to two sessions with a single
 * movement in its pool, so `barbell-calf-raise` was the one exercise in
 * the week that repeated.
 *
 * Nothing repeats now. The line in `levels.ts` about the calf raise being
 * the deliberate exception is gone with it.
 *
 * **The trunk stays on both**, because it has two movements and uses
 * both: an ab wheel on the squat day and a hanging leg raise on the
 * deadlift day. Twice is two exercises there, not one done twice.
 */
const LOWER_SQUAT: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'core']

const LOWER_DEADLIFT: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core']

/**
 * **The week, and there is only one.**
 *
 * Asked for as _"we probably don't need any of the customize workout
 * stuff, let's gut it — I'm trying to make this app and codebase cleaner
 * and more focused."_ There were four splits and a `daysPerWeek` setting
 * choosing between them; there is one, and nothing chooses.
 *
 * **The others were already inconsistent with the design.** The upper and
 * lower days are paired — a muscle's accessory work sits opposite the
 * lift that already trains it, which is what stopped dips and lateral
 * raises appearing twice a week. The two full-body splits put every
 * muscle on every day, so they reproduced exactly the repetition that
 * pairing was built to remove, and the five-day week had a third upper
 * day with no pairing of its own. Keeping them meant shipping three
 * arrangements that were known to be worse.
 *
 * Upper, lower, rest, upper, lower. Wednesday and the weekend off.
 *
 * Two of each region is what makes the pairing expressible: each upper
 * muscle has one day that trains it and one that does not, and the same
 * now holds below the waist.
 */
export const RP_SPLIT: RpSplit = {
  id: 'rp-week-4',
  name: '4-day upper/lower',
  description: 'Upper, lower, rest, upper, lower. Wednesday and the weekend off.',
  daysPerWeek: 4,
  days: [
    {
      index: 0,
      label: 'Monday',
      focusName: 'Upper 1',
      muscles: UPPER_1,
      carries: ['upper'],
      warmUp: 'upper',
    },
    {
      index: 1,
      label: 'Tuesday',
      focusName: 'Lower 1',
      muscles: LOWER_SQUAT,
      carries: ['lower'],
      /*
       * **Swings on the squat day only**, asked for by name. They are a
       * hinge with a real systemic cost, so they belong beside the
       * lifting that already loads the hips — and one dose of that a week
       * is a dose rather than a habit.
       */
      conditioning: ['kb-swing'],
      warmUp: 'lower',
    },
    {
      index: 2,
      label: 'Thursday',
      focusName: 'Upper 2',
      muscles: UPPER_2,
      carries: ['upper'],
      warmUp: 'upper',
    },
    {
      index: 3,
      label: 'Friday',
      focusName: 'Lower 2',
      /* The calves are here and nowhere else — the deadlift day. */
      muscles: LOWER_DEADLIFT,
      carries: ['lower'],
      warmUp: 'lower',
    },
  ],
}

export const RP_SPLITS: readonly RpSplit[] = [RP_SPLIT]

/**
 * The split, which no longer depends on anything.
 *
 * Kept as a function rather than inlined at its two call sites: it is the
 * seam a second split would come back through, and a caller asking for
 * "the split" reads better than one reaching for a constant.
 */
export function rpSplit(): RpSplit {
  return RP_SPLIT
}

/** How many of a week's sessions train a given muscle. */
export function rpFrequency(split: RpSplit, muscle: MuscleGroup): number {
  return split.days.filter((day) => day.muscles.includes(muscle)).length
}
