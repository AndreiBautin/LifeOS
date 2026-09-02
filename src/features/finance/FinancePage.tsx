import { Plus } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { CREDIT_RANGE, type FinanceReading } from '@/domain/finance/reading'
import { formatMinorUnits, toMinorUnits } from '@/domain/upgrades/upgrade'

import { useServices, useSettings } from '@/app/context'
import { ageFromBirthYear, retirementMultipleFor } from '@/domain/finance/standards'

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
 * **All three get levels now, and two of them did not.** The credit
 * score always did, because FICO publishes the bands. Net worth and
 * retirement were judged on direction, on the reasoning that there is no
 * published figure at which somebody has finished having money — true,
 * and not the same as there being no published standard. The Federal
 * Reserve publishes where households your age actually stand, and
 * Fidelity publishes a savings benchmark by age. See
 * `domain/finance/standards.ts`.
 *
 * That is why this screen asks for a **birth year and an income**: both
 * standards are expressed per person, the way a strength standard is a
 * multiple of bodyweight. Neither is required and neither is guessed —
 * without them the ladders say nothing.
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

/**
 * The two facts the published standards are expressed against.
 *
 * Kept on this screen rather than in Settings because they are only ever
 * read here, and because the sentence under them — what the benchmark
 * actually is for your age — is only sayable next to the figures it
 * changes.
 */
function AboutYou() {
  const { settings, update } = useSettings()
  const services = useServices()

  const [birthYear, setBirthYear] = useState(
    settings.birthYear === undefined ? '' : String(settings.birthYear),
  )
  const [income, setIncome] = useState(
    settings.annualIncomeMinor === undefined ? '' : formatMinorUnits(settings.annualIncomeMinor),
  )

  const age =
    settings.birthYear === undefined
      ? undefined
      : ageFromBirthYear(settings.birthYear, services.clock.now())

  return (
    <Section title="About you" description="What the published standards are measured against">
      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-ink-500 mb-1 block text-xs">Birth year</span>
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder="1994"
              value={birthYear}
              onChange={(event) => {
                setBirthYear(event.target.value)
              }}
              onBlur={() => {
                const year = Number(birthYear)
                if (birthYear.trim() === '' || !Number.isFinite(year) || year <= 0) return
                update({ birthYear: Math.round(year) })
              }}
            />
          </label>

          <label className="block">
            <span className="text-ink-500 mb-1 block text-xs">Annual income</span>
            <input
              className={FIELD}
              inputMode="decimal"
              placeholder="0.00"
              value={income}
              onChange={(event) => {
                setIncome(event.target.value)
              }}
              onBlur={() => {
                const minor = toMinorUnits(income)
                if (minor === undefined || minor <= 0) return
                update({ annualIncomeMinor: minor })
              }}
            />
          </label>
        </div>

        {/*
          Says what the standard *is* for this age, so the level below is
          checkable rather than a badge somebody has to trust. Absent
          until there is an age, because there is no benchmark without
          one — and never a guessed year.
        */}
        <p className="text-ink-700 text-xs">
          {age === undefined
            ? 'Without a birth year, net worth and retirement report nothing rather than guessing an age.'
            : `At ${String(age)}, the retirement benchmark is ${retirementMultipleFor(age).toFixed(1)}× your income, and net worth is read against households your age in the 2022 Federal Reserve survey. That survey counts households, so one person living alone reads low against it.`}
        </p>
      </Card>
    </Section>
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

      <AboutYou />

      <Section title="History" description="One row a month, newest first">
        <Card>
          {readings.data === undefined ? null : rows.length === 0 ? (
            <Empty title="Nothing recorded yet">
              All three read as a level from the first entry, each against a published standard —
              the FICO bands, the Federal Reserve&rsquo;s survey of households your age, and
              Fidelity&rsquo;s savings benchmark.
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
