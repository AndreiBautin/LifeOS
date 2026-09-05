import type { StrengthLift } from '@/domain/priority/tiers'
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

export const RP_SPLIT: RpSplit = {
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
