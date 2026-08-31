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

export interface NewFinanceReading {
  readonly netWorthMinor?: number
  readonly retirementMinor?: number
  readonly creditScore?: number
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

  const reading: FinanceReading = {
    ...existing,
    month,
    ...(input.netWorthMinor === undefined ? {} : { netWorthMinor: input.netWorthMinor }),
    ...(input.retirementMinor === undefined ? {} : { retirementMinor: input.retirementMinor }),
    ...(input.creditScore === undefined ? {} : { creditScore: input.creditScore }),
  }

  await deps.finance.save(reading)

  return reading
}
