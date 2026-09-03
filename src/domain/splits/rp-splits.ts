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
const UPPER: readonly MuscleGroup[] = [
  'chest',
  'front-delts',
  'rear-delts',
  'lats',
  'upper-back',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'side-delts',
]

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
      focusName: 'Full body 1',
      muscles: [...UPPER, ...LOWER],
      carries: ['upper', 'lower'],
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Full body — bench and deadlift',
      focusName: 'Full body 2',
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
      focusName: 'Full body 1',
      muscles: [...UPPER, ...LOWER],
      carries: ['upper', 'lower'],
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Full body — bench',
      focusName: 'Full body 2',
      muscles: [...UPPER, ...LOWER],
      carries: ['upper', 'lower'],
      warmUp: 'upper',
    },
    {
      index: 2,
      label: 'Full body — deadlift',
      focusName: 'Full body 3',
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
      focusName: 'Upper 1',
      /*
       * The same pairing the four-day week makes, for the same reason.
       * Friday below keeps the whole upper body, so a muscle these two
       * days do not reach still has somewhere to land.
       */
      muscles: UPPER_1,
      carries: ['upper'],
      conditioning: ['incline-walk'],
      warmUp: 'upper',
    },
    {
      index: 1,
      label: 'Tuesday',
      focusName: 'Lower 1',
      muscles: LOWER,
      carries: ['lower'],
      /*
       * Intervals on the lower days, easy work on the upper days.
       *
       * The split is by *domain*, not by which day has room. Swings are a
       * hinge with a real systemic cost, so they belong beside the
       * lifting that already loads the hips rather than on a bench day
       * where they would be the only lower-body stress of the session.
       * The trade is that Thursday stacks a hinge on the heaviest pull of
       * the week — a deliberate concentration of lower-body fatigue on
       * lower-body days, chosen over spreading it thin across five.
       *
       * This used to be balanced by session length instead: conditioning
       * went wherever the day was short, which put the walk on Thursday
       * and kept the upper days clear. That evened out the clock and made
       * the arrangement unquotable — you could not say what trained when
       * without reading the minute totals.
       */
      conditioning: ['incline-walk', 'kb-swing'],
      warmUp: 'lower',
    },
    {
      index: 2,
      label: 'Wednesday',
      focusName: 'Upper 2',
      muscles: UPPER_2,
      carries: ['upper'],
      conditioning: ['incline-walk'],
      warmUp: 'upper',
    },
    {
      index: 3,
      label: 'Thursday',
      focusName: 'Lower 2',
      muscles: LOWER,
      carries: ['lower'],
      conditioning: ['incline-walk', 'kb-swing'],
      warmUp: 'lower',
    },
    {
      index: 4,
      label: 'Friday',
      focusName: 'Lower 3',
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
      conditioning: ['incline-walk'],
      warmUp: 'upper',
    },
  ],
}

/**
 * Four days, upper and lower twice each, with Wednesday off.
 *
 * The default. Five was chosen when the arms were specialised and the
 * upper days were long; with nothing above tier 2 the week's volume fits
 * in four sittings, and a mid-week rest day is worth more than a fifth
 * session that exists to hold work the other four could carry.
 *
 * Two of each region is also what makes the tiers say something: a tier-2
 * muscle wants two sessions and gets exactly two, so priority maps onto
 * frequency with nothing left over. There is no room for a tier-1 muscle
 * here at all — three sessions of an upper muscle need three upper days —
 * which is why the shipped tiers top out at 2.
 */
const WEEK_4: RpSplit = {
  id: 'rp-week-4',
  name: '4-day upper/lower',
  description:
    'Upper, lower, rest, upper, lower. Every day opens with competition lifting. Wednesday and the weekend off.',
  daysPerWeek: 4,
  days: [
    {
      index: 0,
      label: 'Monday',
      focusName: 'Upper 1',
      muscles: UPPER_1,
      carries: ['upper'],
      conditioning: ['incline-walk'],
      warmUp: 'upper',
    },
    {
      index: 1,
      label: 'Tuesday',
      focusName: 'Lower 1',
      muscles: LOWER,
      carries: ['lower'],
      conditioning: ['incline-walk', 'kb-swing'],
      warmUp: 'lower',
    },
    {
      index: 2,
      label: 'Thursday',
      focusName: 'Upper 2',
      muscles: UPPER_2,
      carries: ['upper'],
      conditioning: ['incline-walk'],
      warmUp: 'upper',
    },
    {
      index: 3,
      label: 'Friday',
      focusName: 'Lower 2',
      muscles: LOWER,
      carries: ['lower'],
      conditioning: ['incline-walk', 'kb-swing'],
      warmUp: 'lower',
    },
  ],
}

export const RP_SPLITS: readonly RpSplit[] = [FULL_BODY_2, FULL_BODY_3, WEEK_4, WEEK_5]

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
