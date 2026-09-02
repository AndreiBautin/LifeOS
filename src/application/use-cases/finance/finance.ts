import type { Clock, FinanceRepository } from '@/domain/repositories/ports'
import { toMonthKey, type FinanceReading } from '@/domain/finance/reading'

export interface FinanceDeps {
  readonly finance: FinanceRepository
  readonly clock: Clock
}

/** Every month on file, newest first — which is the order they are read in. */
export async function listFinance(deps: FinanceDeps): Promise<readonly FinanceReading[]> {
  return [...(await deps.finance.all())].sort((a, b) => b.month.localeCompare(a.month))
}

/**
 * The figures a month can be given, derived from the record itself.
 *
 * `Omit` rather than a hand-written list, and the list below is a mapped
 * type over it rather than a spread, because **this dropped a field
 * silently the first time it grew.** A salary was added to
 * `FinanceReading`, collected by the form, passed in here, and written
 * nowhere — the input type still named three fields, and the object was
 * built with conditional spreads, which is exactly the construction that
 * **defeats excess-property checking**. Nothing failed to compile.
 *
 * That is the second time in this codebase: `addDaily` lost
 * `timesPerDay` the same way, and the fix there was the same one — put
 * the compiler back in charge of noticing.
 */
export type NewFinanceReading = Omit<FinanceReading, 'month' | 'updatedAt'>

/**
 * Every figure a reading carries, as a mapped type over the input.
 *
 * A field added to `FinanceReading` fails the build here until it is
 * listed, which is the `KEYED_BY` mechanism the sync payload uses for
 * the same reason: a hand-maintained copy of a list that already exists
 * will drift, and this one already did.
 */
const FIGURES: Readonly<Record<keyof NewFinanceReading, true>> = {
  netWorthMinor: true,
  retirementMinor: true,
  salaryMinor: true,
  creditScore: true,
  surplusMinor: true,
}

/**
 * Records this month's figures, merging with whatever is already there.
 *
 * **Merged rather than replaced**, and that is the whole reason this is
 * not a plain save. The three numbers arrive at different times — a
 * statement on the 1st, a credit score whenever the card issuer refreshes
 * it — so entering one must not blank the other two. A month is one row
 * being filled in, not three rows pretending to be one.
 *
 * A field left empty is left *alone* rather than cleared, because there
 * is no way to tell "I did not check" from "I meant zero" in an empty
 * box, and of the two readings the second is the one that would corrupt
 * a series.
 */
export async function recordFinance(
  input: NewFinanceReading,
  deps: FinanceDeps,
): Promise<FinanceReading> {
  const month = toMonthKey(deps.clock.now())
  const existing = (await deps.finance.all()).find((reading) => reading.month === month)

  /*
   * An absent figure leaves what was there alone rather than clearing
   * it: there is no telling "I did not check" from "I meant zero" once
   * written, and only the second corrupts a series.
   */
  const given: Record<string, number> = {}
  for (const key of Object.keys(FIGURES) as (keyof NewFinanceReading)[]) {
    const value = input[key]
    if (value !== undefined) given[key] = value
  }

  const reading: FinanceReading = { ...existing, month, ...given }

  await deps.finance.save(reading)

  return reading
}
