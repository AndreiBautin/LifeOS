/**
 * The money figures, read once a month.
 *
 * **Three numbers and no transactions.** A ledger is a different app: it
 * needs every purchase entered, it is the first thing to fall behind,
 * and everything derived from a stale one is quietly wrong. What is
 * here is what somebody already checks monthly and can type from a
 * statement in under a minute.
 *
 * That argument used to point at `domain/vitals/macros.ts` as the place
 * it had already been made. It points nowhere now: the day figures were
 * scrapped, and for a reason a ledger should take seriously — not that
 * they fell behind, but that another app was already keeping them, so
 * the row here was a second copy of a number kept properly elsewhere.
 * **A ledger would be both**, which is why this is still three figures.
 *
 * Keyed by month, so a second entry for August is a *correction* rather
 * than an addition. That makes the merge trivial for the same reason a
 * weigh-in's is: two devices with a figure for one month are two
 * opinions about one fact, and last-write-wins settles it.
 */
export interface FinanceReading {
  /** `YYYY-MM`, and the primary key. */
  readonly month: string
  /**
   * Assets minus debts, in **integer minor units**.
   *
   * Minor units everywhere money appears in this app, for the reason
   * `domain/upgrades/upgrade.ts` gives: JavaScript has no decimal type,
   * and a figure built on binary floating point eventually disagrees
   * with itself. Signed, because a net worth can be negative and
   * pretending otherwise would be the one lie a finance screen must not
   * tell.
   */
  readonly netWorthMinor?: number
  /** Retirement accounts, integer minor units. */
  readonly retirementMinor?: number
  /**
   * Annual salary before tax, integer minor units.
   *
   * **Tracked as a monthly reading rather than held in settings**, which
   * is where it briefly lived. Asked for as _"we should track salary"_,
   * and it belongs here for the reason the other three do: a raise is a
   * thing that happens on a date, and a single settings field records
   * only the latest one with no history to show a campaign stage.
   *
   * It is read live rather than for the month, like the credit score:
   * the retirement benchmark is a multiple of what you earn *now*, not
   * of what you earned in whichever month somebody last opened a screen.
   */
  readonly salaryMinor?: number
  /** 300–850. Absent when it was not checked that month. */
  readonly creditScore?: number
  /**
   * What was left over at the end of the month, integer minor units.
   *
   * **This is the one figure here that is spent rather than only read.**
   * The other four are measurements — where you stand against a
   * published table — and this one accumulates into the pool the tech
   * tree buys from: *"at the end of the month, whatever surplus I have
   * leftover will be added to the pool to spend of that, and this will
   * help me decide what to get next."*
   *
   * **Typed, not derived from the net worth series**, which is the
   * tempting shortcut and is wrong. Net worth moves for reasons that are
   * not surplus — a market swing, a valuation, a debt revalued — so a
   * month where investments rose would hand you money you never had to
   * spend. What is banked is what you decided was spare.
   *
   * Signed, because a month can genuinely go backwards, and a pool that
   * silently floored an overspend at zero would forget it by the next
   * month. Absent means the month was not tallied, which is not the same
   * as a surplus of nothing — the absent-never-zero rule the rest of
   * this file follows.
   */
  readonly surplusMinor?: number
  readonly updatedAt?: string
}

/**
 * The FICO bands, which is what makes credit a **ladder** rather than a
 * rating.
 *
 * A ladder must name an external standard — the second of the three
 * rules in `domain/game/` — and this is about as external as a standard
 * gets: FICO publishes the bands, every lender quotes them, and nothing
 * this app does can move them. Net worth gets no ladder for the mirror
 * reason: there is no published figure at which somebody has *finished*
 * having money, so it is judged on direction instead.
 *
 * Five thresholds because there are five levels, and the fit is genuine
 * rather than arranged: fair, good, very good and exceptional are real
 * boundaries at 580, 670, 740 and 800. The bottom rung is 300, the
 * lowest score that exists.
 */
export const CREDIT_BANDS = [300, 580, 670, 740, 800] as const

/** The lowest and highest a FICO score can be. */
export const CREDIT_RANGE = { min: 300, max: 850 } as const

/**
 * The most recent month with a figure of this kind.
 *
 * Per field, not per reading: somebody who checks their credit score
 * quarterly and their net worth monthly has readings where one is absent
 * and the other is not, and a "latest reading" that returned the newest
 * *row* would report the score as missing every month it was not
 * checked. Absent, never zero — a month nobody looked is not a month the
 * number was nothing.
 */
export function latest<K extends keyof FinanceReading>(
  readings: readonly FinanceReading[],
  field: K,
): FinanceReading[K] | undefined {
  const withValue = readings
    .filter((reading) => reading[field] !== undefined)
    .sort((a, b) => a.month.localeCompare(b.month))

  return withValue[withValue.length - 1]?.[field]
}

/** `YYYY-MM` for a date, in local time — the month a person is in. */
export function toMonthKey(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`
}
