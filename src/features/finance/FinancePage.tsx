import { Plus } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { CREDIT_RANGE, type FinanceReading } from '@/domain/finance/reading'
import { formatMinorUnits, toMinorUnits } from '@/domain/upgrades/upgrade'

import { useFinance, useRecordFinance } from './hooks'

/**
 * The money figures, once a month.
 *
 * **Three numbers and no transactions.** A ledger needs every purchase
 * entered, it is the first thing to fall behind, and everything derived
 * from a stale one is quietly wrong — the same argument that keeps a
 * food log out of the macro targets. These are figures somebody already
 * reads off a statement once a month.
 *
 * **Nothing here pays XP, deliberately.** Typing your net worth in is a
 * measurement, not a thing you did — the app already refuses to pay for
 * standing on a scale — and paying for the number going up would be
 * paying for an outcome. So this area measures without paying, which
 * Vitals did for most of its life.
 *
 * The credit score is the one that gets *levels*, because FICO publishes
 * the bands and nothing this app does can move them. Net worth is judged
 * on direction instead: there is no published figure at which somebody
 * has finished having money, and inventing one would be exactly the
 * scale the game model refuses.
 */

const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 numeric tap-target w-full rounded-xl border px-3 text-sm'

function Row({ reading }: { readonly reading: FinanceReading }) {
  return (
    <li className="border-ink-800 flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-ink-300 numeric shrink-0 text-xs">{reading.month}</span>
      <span className="text-ink-500 numeric flex-1 truncate text-right text-xs">
        {/* Absent, never zero — a month nobody checked is not a month the
            number was nothing, and an em dash says so without arithmetic. */}
        {reading.netWorthMinor === undefined ? '—' : formatMinorUnits(reading.netWorthMinor)}
        {reading.creditScore !== undefined && (
          <span className="text-ink-700"> · {reading.creditScore}</span>
        )}
      </span>
    </li>
  )
}

export function FinancePage() {
  const readings = useFinance()
  const record = useRecordFinance()

  const [netWorth, setNetWorth] = useState('')
  const [retirement, setRetirement] = useState('')
  const [credit, setCredit] = useState('')

  const rows = readings.data ?? []

  const score = Number(credit)
  const scoreOutOfRange =
    credit.trim() !== '' &&
    (!Number.isFinite(score) || score < CREDIT_RANGE.min || score > CREDIT_RANGE.max)

  return (
    <div>
      <PageHeader title="Finance" subtitle="Three numbers, once a month" />

      <Section title="This month" description="Leave a box empty and it keeps what it had">
        <Card>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (scoreOutOfRange) return

              /*
                Read once into a local rather than called twice in the
                spread. `toMinorUnits` returns `number | undefined`, and
                under `exactOptionalPropertyTypes` the compiler cannot
                see that the second call gives the same answer as the
                first — which is a fair objection, since it is a function
                that could in principle not.
              */
              const worth = toMinorUnits(netWorth)
              const saved = toMinorUnits(retirement)

              const input = {
                ...(worth === undefined ? {} : { netWorthMinor: worth }),
                ...(saved === undefined ? {} : { retirementMinor: saved }),
                ...(credit.trim() === '' ? {} : { creditScore: Math.round(score) }),
              }

              if (Object.keys(input).length === 0) return

              record.mutate(input, {
                onSuccess: () => {
                  setNetWorth('')
                  setRetirement('')
                  setCredit('')
                },
              })
            }}
          >
            <label className="block space-y-1">
              <span className="text-ink-500 text-xs">Net worth</span>
              <input
                className={FIELD}
                inputMode="decimal"
                aria-label="Net worth"
                placeholder="Assets minus debts"
                value={netWorth}
                onChange={(event) => {
                  setNetWorth(event.target.value)
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-ink-500 text-xs">Retirement accounts</span>
              <input
                className={FIELD}
                inputMode="decimal"
                aria-label="Retirement accounts"
                placeholder="Total across all of them"
                value={retirement}
                onChange={(event) => {
                  setRetirement(event.target.value)
                }}
              />
            </label>

            <label className="block space-y-1">
              <span className="text-ink-500 text-xs">Credit score</span>
              <input
                className={FIELD}
                inputMode="decimal"
                aria-label="Credit score"
                placeholder={`${String(CREDIT_RANGE.min)}–${String(CREDIT_RANGE.max)}`}
                value={credit}
                onChange={(event) => {
                  setCredit(event.target.value)
                }}
              />
            </label>

            {/*
              Said rather than silently clamped. A score outside the scale
              is a typo, and quietly rounding it to 850 would put somebody
              on the top rung of a ladder by accident — which is the one
              thing a ladder must never do.
            */}
            {scoreOutOfRange && (
              <p className="text-warn-500 text-xs">
                A FICO score runs {CREDIT_RANGE.min} to {CREDIT_RANGE.max}.
              </p>
            )}

            <Button type="submit" variant="primary" full disabled={record.isPending}>
              <Plus size={16} aria-hidden />
              Record this month
            </Button>
          </form>
        </Card>
      </Section>

      <Section title="History" description="One row a month, newest first">
        <Card>
          {readings.data === undefined ? null : rows.length === 0 ? (
            <Empty title="Nothing recorded yet">
              Net worth and retirement are judged on direction, so they say nothing until there are
              two months to compare. The credit score is on a published scale and reads as a level
              from the first entry.
            </Empty>
          ) : (
            <ul>
              {rows.map((reading) => (
                <Row key={reading.month} reading={reading} />
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  )
}
