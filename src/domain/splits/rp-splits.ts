import type { StrengthLift } from '@/domain/priority/tiers'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { RepRange } from '@/domain/programs/prescription'

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
   * The weekday this day is run on, Sunday-indexed like `Date.getDay()`.
   *
   * What the calendar reads to decide which session a date holds — see
   * `domain/programs/schedule.ts`. Stated on a routine written by
   * weekday; a generated split leaves it out and is laid out from Monday.
   */
  readonly weekday?: number
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
   * Which competition lifts open this day, by name.
   *
   * **This went back to naming lifts, and the reason it stopped is
   * gone.** It used to name a *region* — upper or lower — so that the
   * split did not decide how often anybody benched; that was a priority
   * question and priority lived in the tiers. Those tiers were deleted
   * with the rest of the customisation, and `DEFAULT_LIFT_SESSIONS` is
   * one session each, so there is nothing left for a region to derive.
   *
   * What a region cannot express is which of two lower-body lifts opens
   * which day. Asked for as _"ordered squat bench deadlift with those
   * being the main lift for each respectively"_ — with both the squat
   * and the deadlift eligible for every day, the emptiest-day rule
   * decided, and it had no way to know Monday was meant to be the squat.
   */
  readonly carries?: readonly StrengthLift[]
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
  /**
   * The session written out, exercise by exercise, in the order it is run.
   *
   * A day with a routine is taken as written: no volume fill, no picker,
   * no reordering — see `ULPPL_SPLIT` for why. A day without one is
   * generated from `muscles` and `carries` exactly as before.
   */
  readonly routine?: readonly RoutineEntry[]
}

/**
 * One line of a written routine.
 *
 * A `lift` is a competition lift and is built by the strength path, so it
 * takes the competition version (low bar, touch-and-go bench, sumo) and
 * the strength rep range. An `exercise` is accessory work at the compound
 * or isolation range. `conditioning` is a timed block.
 *
 * **An exercise can state its own range, and then it names itself too.**
 * The barbell calf raise runs on both leg days, 10–20 on one and 20–30 on
 * the other — _"same barbell calf raise just switch up the rep range"_.
 * The `variant` is what keeps the two apart afterwards: progression and
 * "last time" both look up history by exercise, and without it the light
 * day would plan its reps from the heavy day's. See `workingLoads` in
 * `start-workout.ts`, which matches on it.
 */
export type RoutineEntry =
  | { readonly kind: 'lift'; readonly lift: StrengthLift }
  | {
      readonly kind: 'exercise'
      readonly slug: string
      readonly reps?: RepRange
      readonly variant?: string
    }
  | { readonly kind: 'conditioning'; readonly slug: string }

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
/**
 * **One main lift a day, and the accessories sit where it does not.**
 *
 * Each muscle carrying accessory work is placed on a day whose
 * competition lift does not already train it — the pairing rule the
 * upper/lower week used, which survives the move to full body because
 * the reason for it does: three heavy sets of bench and then dips is the
 * same muscle twice in one session, and on the bench day the chest has
 * already had its dose.
 *
 * - **Chest on Monday**, benched on Wednesday.
 * - **Upper back on Wednesday**, deadlifted on Friday — and a row
 *   against the bench is the ordinary antagonist pairing besides.
 * - **Lats on Monday**, since the deadlift pays them on Friday.
 * - **Rear delts on Friday**, away from the row.
 * - **Triceps Monday and Friday**, away from the bench.
 * - **Biceps Monday and Wednesday**, away from the deadlift’s grip.
 * - **Side delts and calves** are trained by none of the three, so they
 *   go where the day is lightest.
 *
 * **The core is the one collision and it is deliberate.** It wants two
 * sessions and all three days brace: the squat and the deadlift heavily,
 * the bench barely. Wednesday is free, and the second has to land on a
 * braced day — Friday, where trailingLast already puts it at the end
 * of the session rather than before the pull.
 */
const MONDAY: readonly MuscleGroup[] = ['chest', 'lats', 'triceps', 'biceps']

const WEDNESDAY: readonly MuscleGroup[] = ['upper-back', 'side-delts', 'biceps', 'core']

const FRIDAY: readonly MuscleGroup[] = ['rear-delts', 'calves', 'triceps', 'core']

export const FULL_BODY_SPLIT: RpSplit = {
  id: 'full-body-3',
  name: '3-day full body',
  description: 'Monday, Wednesday, Friday. Squat, bench, deadlift — one main lift each.',
  daysPerWeek: 3,
  days: [
    {
      index: 0,
      label: 'Monday',
      focusName: 'Squat',
      muscles: MONDAY,
      carries: ['squat'],
      /*
       * **Swings on the squat day only**, kept from the four-day week.
       * They are a hinge with a real systemic cost, so they belong beside
       * the lifting that already loads the hips — and one dose a week is
       * a dose rather than a habit. Not the deadlift day, which is the
       * heaviest hinge of the three.
       */
      conditioning: ['kb-swing'],
      warmUp: 'lower',
    },
    {
      index: 1,
      label: 'Wednesday',
      focusName: 'Bench',
      muscles: WEDNESDAY,
      carries: ['bench'],
      warmUp: 'upper',
    },
    {
      index: 2,
      label: 'Friday',
      focusName: 'Deadlift',
      muscles: FRIDAY,
      carries: ['deadlift'],
      warmUp: 'lower',
    },
  ],
}

const lift = (which: StrengthLift): RoutineEntry => ({ kind: 'lift', lift: which })
const exercise = (slug: string): RoutineEntry => ({ kind: 'exercise', slug })

/*
 * **Upper, legs, push, pull, legs — Monday to Friday, the weekend off.**
 * Asked for as _"switch from pplppl to ulppl mon-fri"_, with both leg
 * days written by the lifter and the upper, push and pull days proposed
 * from the exercises already in the week — rearranged, nothing added.
 *
 * Every day is four exercises, and every exercise appears once a week
 * except the barbell calf raise, which runs on both leg days in two
 * ranges. Two corrections shaped the upper half, both worth keeping:
 *
 * - **Lateral raises are not on the overhead-press day.** _"This prevents
 *   getting twice weekly frequency on side delts"_ — the press trains
 *   them, so the raise goes on Upper and the side delts get two days.
 * - **Shrugs are not the day before deadlifts.** _"Shrugs before
 *   deadlifts might have a negative impact"_ — the traps hold the bar on
 *   every pull, so they sit on Monday, four days clear of Friday.
 *
 * That leaves the arms on one day each — both triceps movements on Push,
 * both curls on Pull — which is the price of fitting the shrug onto a
 * four-exercise Upper day. Monday's bench and row still work them.
 *
 * The swings and the treadmill walk are gone: neither leg day lists them.
 * They stay in the catalogue, unscheduled, the way `incline-walk` was.
 */
const UPPER: readonly RoutineEntry[] = [
  lift('bench'),
  exercise('pendlay-row'),
  exercise('db-lateral-raise'),
  exercise('barbell-shrug'),
]

/**
 * The names that tell two versions of one exercise apart within a week.
 *
 * A log under one of these is that version's history and nobody else's:
 * when the light calf raise has never been logged, its last time is
 * nothing — not the heavy one's. Every other variant (Compound,
 * Isolation, Top set) names a kind of slot rather than a version, so a log
 * under it is fair history for whichever version comes next. Read by
 * `workingLoads` and `previousSetFor`, which must agree.
 */
export const DAY_VERSIONS: readonly string[] = ['Heavy', 'Light']

/** Whether a logged entry may stand as last time for a slot of `variant`. */
export function sameVersion(logged: string | undefined, variant: string | undefined): boolean {
  if (logged === variant) return true
  const isVersion = (name: string | undefined) => name !== undefined && DAY_VERSIONS.includes(name)
  return !isVersion(logged) && !isVersion(variant)
}

const LEGS_A: readonly RoutineEntry[] = [
  lift('squat'),
  exercise('romanian-deadlift'),
  { kind: 'exercise', slug: 'barbell-calf-raise', reps: { low: 10, high: 20 }, variant: 'Heavy' },
  exercise('ab-wheel'),
]

const PUSH: readonly RoutineEntry[] = [
  exercise('overhead-press'),
  exercise('dips'),
  exercise('skullcrusher'),
  exercise('french-press'),
]

const PULL: readonly RoutineEntry[] = [
  exercise('pull-up'),
  exercise('rear-delt-raise'),
  exercise('ez-bar-curl'),
  exercise('db-curl'),
]

const LEGS_B: readonly RoutineEntry[] = [
  lift('deadlift'),
  exercise('front-squat'),
  { kind: 'exercise', slug: 'barbell-calf-raise', reps: { low: 20, high: 30 }, variant: 'Light' },
  exercise('hanging-leg-raise'),
]

/**
 * The lifter's own routine, taken as written.
 *
 * **This reverses a rule recorded against pinning exercises to days.**
 * That rule held while the week was *derived* from per-muscle volume
 * targets: a slug list on a day was a transcript that went on being
 * scheduled after the targets that justified it had moved. Here the list
 * is the decision itself, stated by the person who trains it, so there is
 * nothing underneath for it to drift from. The generator is untouched and
 * still builds any day with no routine — `FULL_BODY_SPLIT` is kept for
 * exactly that, and the generator's tests run against it.
 *
 * What survives from the generated week is how each set is run: straight
 * sets, double progression, the strength range on a competition lift and
 * the compound or isolation range on everything else. Each competition
 * lift is in its competition version — low bar, touch-and-go bench,
 * sumo — once a week, spread Monday, Tuesday and Friday.
 */
export const ULPPL_SPLIT: RpSplit = {
  id: 'ulppl-5',
  name: 'Upper, legs, push, pull, legs',
  description: 'Monday to Friday, the weekend off.',
  daysPerWeek: 5,
  days: [
    {
      index: 0,
      label: 'Monday',
      weekday: 1,
      focusName: 'Upper',
      muscles: ['chest', 'upper-back', 'side-delts', 'traps'],
      routine: UPPER,
      warmUp: 'upper',
    },
    {
      index: 1,
      label: 'Tuesday',
      weekday: 2,
      focusName: 'Legs A',
      muscles: ['quads', 'hamstrings', 'calves', 'core'],
      routine: LEGS_A,
      warmUp: 'lower',
    },
    {
      index: 2,
      label: 'Wednesday',
      weekday: 3,
      focusName: 'Push',
      muscles: ['front-delts', 'chest', 'triceps'],
      routine: PUSH,
      warmUp: 'upper',
    },
    {
      index: 3,
      label: 'Thursday',
      weekday: 4,
      focusName: 'Pull',
      muscles: ['lats', 'rear-delts', 'biceps'],
      routine: PULL,
      warmUp: 'upper',
    },
    {
      index: 4,
      label: 'Friday',
      weekday: 5,
      focusName: 'Legs B',
      muscles: ['glutes', 'quads', 'calves', 'core'],
      routine: LEGS_B,
      warmUp: 'lower',
    },
  ],
}

/** The week the app runs. */
export const RP_SPLIT: RpSplit = ULPPL_SPLIT

export const RP_SPLITS: readonly RpSplit[] = [ULPPL_SPLIT, FULL_BODY_SPLIT]

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
