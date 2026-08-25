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
 * Roughly where the returns flatten in the literature RP works from. The
 * exact figure is arguable and the shape is not: there is a per-session
 * ceiling, it is well below a week's worth of volume for a prioritised
 * muscle, and pretending otherwise concentrates junk volume into one day.
 */
export const MAX_DIRECT_SETS_PER_SESSION = 6

/**
 * What share of the available days each tier is trained on.
 *
 * Tier 1 takes all of them, tier 2 two thirds — "two of the three upper
 * days" — and tier 3 is trained once, which is what maintenance is.
 */
export const TIER_FREQUENCY_SHARE: Readonly<Record<number, number>> = {
  1: 1,
  2: 2 / 3,
  3: 0,
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

  const share = TIER_FREQUENCY_SHARE[tierRank] ?? 0
  return Math.min(daysAvailable, Math.max(1, Math.round(daysAvailable * share)))
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
