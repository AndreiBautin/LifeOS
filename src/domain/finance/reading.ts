/**
 * The money figures, read once a month.
 *
 * **Three numbers and no transactions.** A ledger is a different app: it
 * needs every purchase entered, it is the first thing to fall behind,
 * and everything derived from a stale one is quietly wrong — the same
 * argument that keeps a food log out of `domain/vitals/macros.ts`. What
 * is here is what somebody already checks monthly and can type from a
 * statement in under a minute.
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
  /** 300–850. Absent when it was not checked that month. */
  readonly creditScore?: number
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
