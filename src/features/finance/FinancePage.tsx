import { Plus } from 'lucide-react'
import { useState } from 'react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, Empty, Section } from '@/components/shared/primitives'
import { CREDIT_RANGE, toMonthKey, type FinanceReading } from '@/domain/finance/reading'
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

/**
 * One month, showing **every figure it holds**.
 *
 * It used to draw the net worth and the credit score and nothing else,
 * so a month with all four recorded rendered two of them. Reported as
 * _"I thought I recorded all three, but it says I only put credit score
 * — went to the finance page and it shows a row but I only see 2."_ The
 * retirement figure was written to the database correctly every time and
 * had no way to be seen.
 *
 * Labelled rather than positional now: four numbers separated by dots
 * are four numbers nobody can tell apart, and that is the shape the bug
 * hid in.
 */
function Row({ reading }: { readonly reading: FinanceReading }) {
  const figures = [
    { label: 'Worth', value: reading.netWorthMinor, money: true },
    { label: 'Retirement', value: reading.retirementMinor, money: true },
    { label: 'Salary', value: reading.salaryMinor, money: true },
    { label: 'Credit', value: reading.creditScore, money: false },
  ].filter((one) => one.value !== undefined)

  return (
    <li className="border-ink-800 border-b py-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-ink-300 numeric shrink-0 text-xs">{reading.month}</span>

        {/* Absent, never zero — a month nobody checked is not a month the
            number was nothing, and saying so beats printing a nought. */}
        {figures.length === 0 && <span className="text-ink-700 text-xs">Nothing recorded</span>}
      </div>

      {figures.length > 0 && (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
          {figures.map((one) => (
            <div key={one.label} className="flex items-baseline justify-between gap-2">
              <dt className="text-ink-700 text-xs">{one.label}</dt>
              <dd className="text-ink-500 numeric text-xs">
                {one.money ? formatMinorUnits(one.value ?? 0) : String(one.value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}

/**
 * The one fact about you that the published standards need.
 *
 * **The income field that used to sit beside this has gone**, and the
 * salary is a tracked figure in the form below instead. Asked for as
 * _"we should track salary"_ — and it was the right correction twice
 * over: a raise happens on a date, so it belongs in the monthly record
 * with the rest of the money, and holding it in settings as well would
 * be two copies of one number waiting to disagree. The retirement
 * benchmark reads the latest recorded salary now.
 *
 * A birth year stays here because it is not a series. Nothing about it
 * changes month to month, and a reading of it would be the same number
 * written down repeatedly.
 */
function AboutYou() {
  const { settings, update } = useSettings()
  const services = useServices()

  const [birthYear, setBirthYear] = useState(
    settings.birthYear === undefined ? '' : String(settings.birthYear),
  )

  const age =
    settings.birthYear === undefined
      ? undefined
      : ageFromBirthYear(settings.birthYear, services.clock.now())

  return (
    <Section title="About you" description="What the published standards are measured against">
      <Card className="space-y-3">
        <label className="block space-y-1">
          <span className="text-ink-500 text-xs">Birth year</span>
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

        {/*
          Says what the standard *is* for this age, so the level on the
          hub is checkable rather than a badge to be trusted. Absent
          until there is an age, because there is no benchmark without
          one — and never a guessed year.
        */}
        <p className="text-ink-700 text-xs">
          {age === undefined
            ? 'Without a birth year, net worth and retirement report nothing rather than guessing an age.'
            : `At ${String(age)}, the retirement benchmark is ${retirementMultipleFor(age).toFixed(1)}× the salary below, and net worth is read against households your age in the 2022 Federal Reserve survey. That survey counts households, so one person living alone reads low against it.`}
        </p>
      </Card>
    </Section>
  )
}

export function FinancePage() {
  const readings = useFinance()
  const record = useRecordFinance()

  const services = useServices()
  const month = toMonthKey(services.clock.now())

  const rows = readings.data ?? []
  const thisMonth = rows.find((one) => one.month === month)

  /*
   * **Opened on what is already recorded, which is what makes this an
   * editor.** Asked for as _"any way to edit?"_ — and there had been no
   * way to see a figure, let alone correct one: the boxes were always
   * blank, so fixing a typo meant remembering what you had typed and
   * typing it again over the top.
   *
   * Keyed on the month so the fields fill in as soon as the record
   * loads, and reset if the month turns over while the screen is open.
   * A plain `useState` would hold the empty strings it was mounted with.
   */
  const [netWorth, setNetWorth] = useState('')
  const [retirement, setRetirement] = useState('')
  const [salary, setSalary] = useState('')
  const [credit, setCredit] = useState('')
  const [openedOn, setOpenedOn] = useState<string | undefined>(undefined)

  if (readings.data !== undefined && openedOn !== month) {
    setOpenedOn(month)
    setNetWorth(
      thisMonth?.netWorthMinor === undefined ? '' : formatMinorUnits(thisMonth.netWorthMinor),
    )
    setRetirement(
      thisMonth?.retirementMinor === undefined ? '' : formatMinorUnits(thisMonth.retirementMinor),
    )
    setSalary(thisMonth?.salaryMinor === undefined ? '' : formatMinorUnits(thisMonth.salaryMinor))
    setCredit(thisMonth?.creditScore === undefined ? '' : String(thisMonth.creditScore))
  }

  const score = Number(credit)
  const scoreOutOfRange =
    credit.trim() !== '' &&
    (!Number.isFinite(score) || score < CREDIT_RANGE.min || score > CREDIT_RANGE.max)

  return (
    <div>
      <PageHeader title="Finance" subtitle="Four numbers, once a month" />

      <Section
        title={`This month · ${month}`}
        description="Opens on what is recorded. An empty box keeps what it had rather than clearing it"
      >
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
              const earned = toMinorUnits(salary)

              const input = {
                ...(worth === undefined ? {} : { netWorthMinor: worth }),
                ...(saved === undefined ? {} : { retirementMinor: saved }),
                ...(earned === undefined ? {} : { salaryMinor: earned }),
                ...(credit.trim() === '' ? {} : { creditScore: Math.round(score) }),
              }

              if (Object.keys(input).length === 0) return

              /*
                The fields are **not** cleared on success any more. They
                were, which made sense while this was a blank form you
                filed once — and reads as the entry having been thrown
                away now that the boxes show what is on record.
              */
              record.mutate(input)
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
              <span className="text-ink-500 text-xs">Salary</span>
              <input
                className={FIELD}
                inputMode="decimal"
                aria-label="Salary"
                placeholder="Annual, before tax"
                value={salary}
                onChange={(event) => {
                  setSalary(event.target.value)
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
