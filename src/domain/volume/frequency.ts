/**
 * How many sessions a week a muscle is trained directly.
 *
 * **Priority decides this, not volume.** A muscle in the top tier is
 * trained on every day accountable for it; one a tier down is trained on
 * most of them; a maintained one is trained once. That is what
 * prioritising something means when you say it out loud — "I train delts
 * every upper day" — and it is the same sentence whether you are
 * describing the plan or reading it off the week.
 *
 * This replaced a volume-derived rule: divide the weekly target by a
 * per-session ceiling and take the answer. Defensible, and it produced a
 * frequency table nobody could predict from their own tier list. The
 * forearms came out at two sessions and the lats at three, so a tier-1
 * muscle was trained less often than a tier-2 one — arithmetically
 * correct, and impossible to describe without walking through the
 * arithmetic.
 *
 * The volume ceiling has not gone anywhere; it just stopped setting the
 * frequency. See {@link setsPerSession}.
 */

/**
 * Direct sets of one muscle worth doing in a single session.
 *
 * Five. It was eight, and eight was chosen to solve a problem that no
 * longer exists: the side delts were asked for twenty sets a week and
 * could not receive them at six per session, so the ceiling was raised
 * rather than the ask lowered. Capping the weekly targets instead — see
 * {@link MAX_WEEKLY_DIRECT_SETS} — fixes it from the other end and leaves
 * the per-session figure where the returns actually flatten.
 *
 * The shape matters more than the number: there is a per-session ceiling,
 * it is well below a week's volume for a prioritised muscle, and
 * pretending otherwise concentrates junk volume into one day.
 */
export const MAX_DIRECT_SETS_PER_SESSION = 5

/**
 * Sessions a week a muscle is ever trained directly.
 *
 * Three, and this is now a hard ceiling rather than "however many days
 * happen to be accountable". A tier-1 muscle in a five-upper-day split
 * used to be trained five times; it is trained three times.
 */
export const MAX_FREQUENCY = 3

/**
 * The most direct volume a week can hold for one muscle.
 *
 * Derived rather than declared, because the three numbers have to agree
 * and a fourth constant is a fourth thing to keep in step. Five sets on
 * each of three sessions is fifteen, so a weekly target above fifteen is
 * one the split cannot deliver however it is arranged — which is why the
 * landmarks are clamped to it rather than published above it.
 */
export const MAX_WEEKLY_DIRECT_SETS = MAX_DIRECT_SETS_PER_SESSION * MAX_FREQUENCY

/**
 * Sessions a week each tier gets.
 *
 * A direct map from priority to frequency, which is the whole point: tier
 * 2 is trained twice a week, always, and you can say that without knowing
 * the split. It was a *share* of the accountable days — tier 1 all of
 * them, tier 2 two thirds — which meant the answer moved when the split
 * did, and a tier-2 muscle on a two-day pool rounded down to one.
 */
export const TIER_FREQUENCY: Readonly<Record<number, number>> = {
  1: MAX_FREQUENCY,
  2: 2,
  3: 1,
}

/**
 * Sessions a muscle in this tier should get, given the days available.
 *
 * Never more than the days there are: asking for four sessions of a
 * muscle in a three-day week is not a plan the split can honour, and a
 * floor that cannot be met would have the filler add slots forever
 * trying.
 */
export function requiredFrequency(tierRank: number, daysAvailable: number): number {
  if (daysAvailable <= 0) return 0

  /*
   * Still capped by the days there are. Asking for three sessions of a
   * muscle on a two-day pool is not a plan the split can honour, and a
   * floor that cannot be met would have the backfill add slots forever
   * trying to reach it. The Plan screen reports the shortfall instead.
   */
  return Math.min(daysAvailable, TIER_FREQUENCY[tierRank] ?? 1)
}

/**
 * Direct sets to put in one session, given how many sessions there are.
 *
 * Where the volume ceiling still lives. Frequency says how many times a
 * week; this says how much each time, and caps it — a muscle squeezed
 * into fewer sessions than its volume wants does not get a bigger
 * session, it gets a session at the ceiling and a shortfall, which is
 * the honest outcome and the one the Plan screen reports.
 */
export function setsPerSession(weeklyTarget: number, frequency: number): number {
  if (frequency <= 0) return 0
  return Math.min(MAX_DIRECT_SETS_PER_SESSION, Math.ceil(weeklyTarget / frequency))
}
