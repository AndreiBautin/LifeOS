import { Flame, Pencil, Plus, Scale, Trash2, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { useServices, useSettings } from '@/app/context'
import {
  READINESS_SCALE,
  type ReadinessFactors,
  type ReadinessLevel,
} from '@/domain/autoregulation/check-in'
import { NEUTRAL_READINESS } from '@/domain/vitals/condition'
import {
  PHASE_LABELS,
  PHASE_RATES,
  PHASE_VERDICT_LABELS,
  PHASES,
  TREND_DAYS,
} from '@/domain/vitals/weight'
import {
  cycleOf,
  describeCycle,
  readCharges,
  rollingHours,
  type ChargeCycle,
  type Vice,
} from '@/domain/vitals/charges'
import { UPKEEP } from '@/domain/base/base'
import type { DailyView } from '@/application/use-cases/dailies/dailies'
import { cn } from '@/lib/cn'

import { AddDaily } from '../today/Dailies'
import { useKeepToday, useMoveDailyHome, useUndoToday, useUpkeep } from '../today/dailies-hooks'
import { projectCorridor } from '@/domain/vitals/weight'
import { TrendChart } from '@/components/shared/TrendChart'

import type { NewVice } from '@/application/use-cases/vitals/vitals'

import {
  useAddVice,
  useEditVice,
  useRecordCondition,
  useRecordWeighIn,
  useRetireVice,
  useVices,
  useVitalsToday,
  useWeighIns,
} from './hooks'

/**
 * Vitals: the screen where the two bars on Today are set up and read.
 *
 * Today owns the *acting* — spend a charge, see what is left — and this
 * screen owns the *deciding*: which pools exist, what phase you are in,
 * how the day felt. That is the same line Settings and the tech tree sit
 * on relative to You, and it is why this is a link rather than a ninth
 * tab. It is also why it is a link rather than a tab even though there
 * is room on the *screen*: a tab is somewhere you act.
 */

/**
 * The three the request named, offered rather than seeded — and each on
 * the cycle people actually hold it on.
 *
 * Coffee is the case that earns the rolling window: two a day resetting
 * at midnight invites a third at eleven at night, and twelve hours does
 * not. Beer is the case that made hours read as nonsense — nobody
 * budgets four a week as "one back every forty-two hours".
 */
const SUGGESTIONS: readonly NewVice[] = [
  { name: 'Coffee', capacity: 2, cycle: { kind: 'rolling', hours: 12 } },
  { name: 'Kush', capacity: 1, cycle: { kind: 'calendar', period: 'day' } },
  { name: 'Beer', capacity: 4, cycle: { kind: 'calendar', period: 'week' } },
  /*
   * Water is the one that runs the other way — filled rather than spent
   * — and caffeine is the one that shows why a count was not enough: a
   * double espresso and a cold brew are one coffee each and very
   * different amounts.
   *
   * 400 mg is the figure health agencies give as a daily ceiling for
   * most adults; the water target is a round 3 litres and is a starting
   * point rather than a claim, which is why both are editable.
   */
  {
    name: 'Water',
    capacity: 3000,
    unit: 'ml',
    direction: 'target',
    cycle: { kind: 'calendar', period: 'day' },
    presets: [
      { label: '+250', amount: 250 },
      { label: '+500', amount: 500 },
      { label: '+1L', amount: 1000 },
    ],
  },
  {
    name: 'Caffeine',
    capacity: 400,
    unit: 'mg',
    direction: 'limit',
    cycle: { kind: 'calendar', period: 'day' },
    presets: [
      { label: 'Espresso', amount: 65 },
      { label: 'Coffee', amount: 95 },
      { label: 'Energy drink', amount: 160 },
    ],
  },
]

const FACTORS: readonly { key: keyof ReadinessFactors; label: string }[] = [
  { key: 'sleep', label: 'Sleep' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'hydration', label: 'Hydration' },
  { key: 'stress', label: 'Stress' },
  { key: 'motivation', label: 'Motivation' },
]

const LEVEL_LABELS: Record<ReadinessLevel, string> = { poor: 'Poor', ok: 'OK', good: 'Good' }

/** How much of the history the chart shows. Four weeks is two trend windows. */
const CHART_DAYS = 28

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `YYYY-MM-DD` this many days before `now`.
 *
 * Takes the clock as a parameter rather than reading it. `Date.now()`
 * slips past the lint rule — which bans bare `new Date()` — and it is
 * the same defect the rule exists to catch: a window that cannot be held
 * still is a chart no test can assert about.
 */
function sinceDay(days: number, now: Date): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
}

function ConditionEditor() {
  const vitals = useVitalsToday()
  const record = useRecordCondition()

  const current = vitals.data?.condition?.readiness ?? NEUTRAL_READINESS
  const recorded = vitals.data?.condition !== undefined

  return (
    <Card>
      <p className="text-ink-500 mb-3 text-sm">
        {recorded ? 'Recorded for today.' : 'Not recorded today.'} This is self-reported, and it
        scales today&rsquo;s session — never your settings. A bad night is not evidence that a
        muscle&rsquo;s weekly tolerance has changed.
      </p>

      <div className="space-y-2">
        {FACTORS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-ink-300 text-sm">{label}</span>
            <div className="flex gap-1">
              {READINESS_SCALE.map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant={current[key] === level ? 'primary' : 'outline'}
                  aria-pressed={current[key] === level}
                  aria-label={`${label}: ${LEVEL_LABELS[level]}`}
                  disabled={record.isPending}
                  onClick={() => {
                    record.mutate({ ...current, [key]: level })
                  }}
                >
                  {LEVEL_LABELS[level]}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PhaseEditor() {
  const { settings, update } = useSettings()
  const now = useServices().clock.now()
  const vitals = useVitalsToday()
  const weighIns = useWeighIns()
  const record = useRecordWeighIn()
  const [weight, setWeight] = useState('')

  const phase = vitals.data?.phase

  /*
   * The window is fixed rather than "the last ten readings", so the x
   * axis is time and not reading-count. Ten readings taken daily and ten
   * taken monthly are different stories, and a chart indexed by position
   * draws them identically.
   */
  const shown = (weighIns.data ?? []).filter((row) => row.day >= sinceDay(CHART_DAYS, now))
  const first = shown[0]
  const latest = shown[shown.length - 1]

  const plot = shown.map((row) => ({
    x: daysBetween(first?.day ?? row.day, row.day),
    y: row.weight,
  }))

  /*
   * Anchored on the earliest reading shown, which is the honest
   * limitation: one unrepresentative morning shifts the whole corridor.
   * It is guidance drawn behind the line, and `phaseVerdict` — which
   * reads the smoothed fortnight — remains the judgement.
   */
  const corridor =
    first === undefined || latest === undefined
      ? []
      : projectCorridor(first.weight, daysBetween(first.day, latest.day), settings.phaseRate).map(
          (point) => ({ x: point.day, low: point.low, high: point.high }),
        )

  return (
    <Card>
      <div className="mb-3 flex gap-1">
        {PHASES.map((option) => (
          <Button
            key={option}
            size="sm"
            full
            variant={settings.phase === option ? 'primary' : 'outline'}
            aria-pressed={settings.phase === option}
            onClick={() => {
              /*
               * Changing the phase moves the band with it. Keeping a cut's
               * band under a bulk would judge the new phase against the
               * old one's target and report failure for a decision the
               * lifter just made deliberately.
               */
              update({ phase: option, phaseRate: PHASE_RATES[option] })
            }}
          >
            {PHASE_LABELS[option]}
          </Button>
        ))}
      </div>

      <p className="text-ink-500 mb-3 text-sm">
        Target {settings.phaseRate.min} to {settings.phaseRate.max}% of bodyweight a week, smoothed
        over {TREND_DAYS} days. Calories are tracked elsewhere; this is the part that app
        can&rsquo;t tell you.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const value = Number(weight)
          if (!Number.isFinite(value) || value <= 0) return
          record.mutate(value)
          setWeight('')
        }}
      >
        <input
          className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target min-w-0 flex-1 rounded-lg border px-3 text-sm"
          inputMode="decimal"
          placeholder={`Today's weight (${settings.units})`}
          aria-label="Today's weight"
          value={weight}
          onChange={(event) => {
            setWeight(event.target.value)
          }}
        />
        <Button type="submit" variant="primary" disabled={record.isPending}>
          <Scale size={16} aria-hidden />
          Log
        </Button>
      </form>

      {phase !== undefined && (
        <p className="text-ink-500 numeric mt-3 text-sm">
          {phase.trend === undefined
            ? 'Two weeks of readings gives a rate.'
            : `${phase.trend.current.toFixed(1)} over ${String(phase.trend.readings)} reading${phase.trend.readings === 1 ? '' : 's'} — ${PHASE_VERDICT_LABELS[phase.verdict]}`}
        </p>
      )}

      {/*
        A line rather than the column of numbers that was here.
        Bodyweight is a time series and printing it as a list made the
        reader do the plotting — which is exactly the work a chart is
        for, and the reason this was the first thing to change.
      */}
      {plot.length >= 2 && (
        <div className="border-ink-800 mt-3 border-t pt-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <p className="text-ink-700 text-xs tracking-wide uppercase">
              Last {String(CHART_DAYS)} days
            </p>
            <p className="text-ink-700 text-xs">green is the phase target</p>
          </div>

          <TrendChart
            points={plot}
            corridor={corridor}
            label={`Bodyweight over the last ${String(CHART_DAYS)} days, against the ${PHASE_LABELS[
              settings.phase
            ].toLowerCase()} target corridor`}
          />

          <div className="text-ink-700 numeric mt-1 flex justify-between text-xs">
            <span>{first?.day.slice(5)}</span>
            <span>{latest?.day.slice(5)}</span>
          </div>
        </div>
      )}

      {plot.length === 1 && (
        <p className="text-ink-500 mt-3 text-sm">One reading. A second gives it a line to draw.</p>
      )}
    </Card>
  )
}

/**
 * What to eat, derived from the scale rather than from a formula.
 *
 * The one field here is the calorie target the lifter is *already*
 * eating to, taken from whichever app tracks their food. Everything else
 * follows: protein and the fat floor off bodyweight, the total corrected
 * by the weight trend, carbohydrate as the remainder.
 *
 * The correction is the part worth the screen space, because it is the
 * only thing here the calorie app could not have told them.
 */
function MacroTargetsCard() {
  const { settings, update } = useSettings()
  const vitals = useVitalsToday()
  const [intake, setIntake] = useState('')

  const macros = vitals.data?.macros
  const stated = settings.dailyCalories

  return (
    <Card>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const value = Number(intake)
          if (!Number.isFinite(value) || value <= 0) return
          update({ dailyCalories: value })
          setIntake('')
        }}
      >
        <input
          className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target min-w-0 flex-1 rounded-lg border px-3 text-sm"
          inputMode="decimal"
          placeholder={
            stated === undefined ? 'What you eat now (kcal)' : `Eating ${String(stated)} kcal`
          }
          aria-label="Calories you are currently eating"
          value={intake}
          onChange={(event) => {
            setIntake(event.target.value)
          }}
        />
        <Button type="submit" variant="outline">
          Set
        </Button>
      </form>

      {macros === undefined ? (
        <p className="text-ink-500 text-sm">
          Log a weight and these follow from it — protein and fat off bodyweight, the total
          corrected by what the scale actually does.
        </p>
      ) : (
        <>
          {/*
            The correction leads, because it is the only line here the
            calorie app could not have produced. Absent and zero read
            differently on purpose: "on track" is a judgement, "not
            enough readings" is the absence of one.
          */}
          <div className="border-ink-800 mb-3 border-b pb-3">
            {macros.adjustment === undefined ? (
              <p className="text-ink-500 text-sm">
                Two weeks of weigh-ins and this starts advising.
              </p>
            ) : macros.adjustment === 0 ? (
              <p className="text-good-500 text-sm">
                The scale is doing what the phase asked — hold the intake where it is.
              </p>
            ) : (
              <p className="text-ink-50 text-sm">
                About{' '}
                <span className="numeric font-semibold">
                  {Math.abs(macros.adjustment)} {macros.adjustment < 0 ? 'fewer' : 'more'}
                </span>{' '}
                a day
                <span className="text-ink-500"> — the smallest change that reaches the band.</span>
              </p>
            )}
          </div>

          <dl className="space-y-1.5">
            {macros.calories !== undefined && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-300 text-sm">Calories</dt>
                <dd className="text-ink-50 numeric text-sm font-semibold">{macros.calories}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-300 text-sm">Protein</dt>
              <dd className="text-ink-50 numeric text-sm">{macros.protein} g</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-300 text-sm">
                Fat <span className="text-ink-700 text-xs">floor</span>
              </dt>
              <dd className="text-ink-50 numeric text-sm">{macros.fat} g</dd>
            </div>
            {macros.carbs !== undefined && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-300 text-sm">
                  Carbs <span className="text-ink-700 text-xs">the remainder</span>
                </dt>
                <dd className="text-ink-50 numeric text-sm">{macros.carbs} g</dd>
              </div>
            )}
          </dl>

          {/*
            Surfaced rather than resolved: a negative remainder is not
            "eat zero carbs", it is the calorie figure and the phase
            disagreeing.
          */}
          {macros.floorsExceedCalories && (
            <p className="text-bad-500 mt-3 text-sm">
              Protein and the fat floor alone come to more than that calorie figure. One of the two
              needs to move.
            </p>
          )}

          {macros.calories === undefined && (
            <p className="text-ink-500 mt-3 text-sm">
              Set what you eat now and this gets a calorie total and a carb target — a remainder
              needs something to be left over from.
            </p>
          )}
        </>
      )}
    </Card>
  )
}

/** The four shapes offered, in the order people reach for them. */
const CYCLE_CHOICES: readonly {
  readonly id: string
  readonly label: string
  readonly cycle: ChargeCycle
}[] = [
  { id: 'day', label: 'a day', cycle: { kind: 'calendar', period: 'day' } },
  { id: 'week', label: 'a week', cycle: { kind: 'calendar', period: 'week' } },
  { id: 'month', label: 'a month', cycle: { kind: 'calendar', period: 'month' } },
  { id: 'rolling', label: 'rolling', cycle: { kind: 'rolling', hours: 12 } },
]

/** Which of `CYCLE_CHOICES` a stored cycle corresponds to. */
function choiceFor(vice: Vice): string {
  const cycle = cycleOf(vice)
  return cycle.kind === 'rolling' ? 'rolling' : cycle.period
}

/**
 * One pool, editable in place.
 *
 * Editing existed in the use-case from the day pools did and no screen
 * reached it — the third time in this app that a working capability was
 * invisible because nothing called it. It mattered here the moment
 * cycles arrived: a pool written before them is a rolling one, and
 * without this the only way to put beer on a weekly allowance was to
 * retire it and start again, throwing away every spend it had recorded.
 */
function ViceRow({ vice, now }: { readonly vice: Vice; readonly now: Date }) {
  const edit = useEditVice()
  const retire = useRetireVice()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(vice.name)
  const [capacity, setCapacity] = useState(String(vice.capacity))
  const [choice, setChoice] = useState(choiceFor(vice))
  const [hours, setHours] = useState(String(rollingHours(vice)))

  const reading = readCharges(vice, now)

  if (open) {
    return (
      <li className="py-2">
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            const picked = CYCLE_CHOICES.find((one) => one.id === choice)?.cycle ?? cycleOf(vice)

            edit.mutate(
              {
                id: vice.id,
                input: {
                  name,
                  capacity: Number(capacity),
                  cycle:
                    picked.kind === 'rolling' ? { kind: 'rolling', hours: Number(hours) } : picked,
                },
              },
              {
                onSuccess: () => {
                  setOpen(false)
                },
              },
            )
          }}
        >
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
            aria-label={`Name for ${vice.name}`}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <div className="flex items-center gap-2">
            <input
              className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-16 shrink-0 rounded-lg border px-2 text-sm"
              inputMode="decimal"
              aria-label={`How many ${vice.name}`}
              value={capacity}
              onChange={(event) => {
                setCapacity(event.target.value)
              }}
            />
            <select
              className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
              aria-label={`How often ${vice.name} refills`}
              value={choice}
              onChange={(event) => {
                setChoice(event.target.value)
              }}
            >
              {CYCLE_CHOICES.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="primary" size="sm" disabled={edit.isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
              }}
            >
              Cancel
            </Button>
          </div>
          {choice === 'rolling' && (
            <label className="text-ink-500 flex items-center gap-2 text-xs">
              One back every
              <input
                className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-20 rounded-lg border px-2 text-sm"
                inputMode="decimal"
                aria-label={`Hours until a ${vice.name} charge returns`}
                value={hours}
                onChange={(event) => {
                  setHours(event.target.value)
                }}
              />
              hours
            </label>
          )}
          {/*
            Said out loud, because it is the one edit here that changes
            what the pool has already recorded. The spends are untouched;
            what changes is which of them still count.
          */}
          <p className="text-ink-700 text-xs">
            Changing this re-reads the {vice.spent.length} spend
            {vice.spent.length === 1 ? '' : 's'} already recorded. None are lost.
          </p>
        </form>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-ink-50 truncate text-sm font-medium">{vice.name}</p>
        <p className="text-ink-700 numeric text-xs">
          {/* `describeCycle` states the whole limit — "4 a week", "2, one
              back every 12h" — so the sentence that used to wrap it is
              gone rather than doubled. */}
          {describeCycle(vice)} · {vice.spent.length} spent all told
        </p>
      </div>
      <Badge tone={reading.over > 0 ? 'bad' : 'neutral'}>
        {reading.over > 0 ? `${String(reading.over)} over` : `${String(reading.available)} left`}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Edit ${vice.name}`}
        onClick={() => {
          setOpen(true)
        }}
      >
        <Pencil size={14} aria-hidden />
      </Button>
      {/*
        Retire, not delete. Months of spends are a true account of a
        stretch of your life, and deleting the pool takes them with it.
      */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Retire ${vice.name}`}
        disabled={retire.isPending}
        onClick={() => {
          retire.mutate(vice.id)
        }}
      >
        <Trash2 size={14} aria-hidden />
      </Button>
    </li>
  )
}

function AddVice() {
  const add = useAddVice()
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('2')
  const [choice, setChoice] = useState('week')
  const [hours, setHours] = useState('12')

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim() === '') return
        const picked = CYCLE_CHOICES.find((one) => one.id === choice)?.cycle ?? {
          kind: 'calendar' as const,
          period: 'week' as const,
        }

        add.mutate({
          name,
          capacity: Number(capacity),
          cycle: picked.kind === 'rolling' ? { kind: 'rolling', hours: Number(hours) } : picked,
        })
        setName('')
      }}
    >
      <input
        className="bg-ink-900 border-ink-700 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
        placeholder="What are you limiting?"
        aria-label="Name"
        value={name}
        onChange={(event) => {
          setName(event.target.value)
        }}
      />
      {/*
        Read as a sentence — "4 a week" — because that is how the limit is
        held in the first place. The old pair of boxes asked for a count
        and a number of hours, which is the right question for coffee and
        a translation exercise for anything weekly.
      */}
      <div className="flex items-center gap-2">
        <input
          className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-16 shrink-0 rounded-lg border px-2 text-sm"
          inputMode="decimal"
          aria-label="How many"
          value={capacity}
          onChange={(event) => {
            setCapacity(event.target.value)
          }}
        />
        <select
          className="bg-ink-900 border-ink-700 text-ink-50 tap-target min-w-0 flex-1 rounded-lg border px-2 text-sm"
          aria-label="How often the pool refills"
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value)
          }}
        >
          {CYCLE_CHOICES.map((one) => (
            <option key={one.id} value={one.id}>
              {one.label}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" disabled={add.isPending}>
          <Plus size={16} aria-hidden />
          Add
        </Button>
      </div>

      {/*
        Only asked for when it is the answer. A rolling window is the one
        shape that needs a number, and putting that box on screen
        permanently was what made every pool look like it was measured in
        hours.
      */}
      {choice === 'rolling' && (
        <label className="text-ink-500 flex items-center gap-2 text-xs">
          One back every
          <input
            className="bg-ink-900 border-ink-700 text-ink-50 numeric tap-target w-20 rounded-lg border px-2 text-sm"
            inputMode="decimal"
            aria-label="Hours until a charge returns"
            value={hours}
            onChange={(event) => {
              setHours(event.target.value)
            }}
          />
          hours
        </label>
      )}
    </form>
  )
}

/**
 * One thing you keep on top of, and how much of today's is done.
 *
 * A daily in every respect — cadence, streak, and the count that arrived
 * for chores done several times a day, which is exactly what brushing
 * twice needs. What it is not is a *quest*, and on Today these crowd out
 * the things somebody actually chose: the same argument that moved house
 * work to Base, applied to the other set of chores nobody calls chores.
 */
function UpkeepRow({ view }: { readonly view: DailyView }) {
  const keep = useKeepToday('vitals.upkeep-kept')
  const undo = useUndoToday()
  const moveHome = useMoveDailyHome()

  const { daily, doneToday, expectedToday, doneCount, needed } = view

  return (
    <li className="flex items-center gap-3 py-2">
      <Button
        variant={doneToday ? 'primary' : 'outline'}
        aria-label={
          doneToday
            ? `Undo ${daily.title}`
            : needed > 1
              ? `Log ${daily.title}, ${String(doneCount)} of ${String(needed)} done`
              : `Mark ${daily.title} done`
        }
        aria-pressed={doneToday}
        disabled={keep.isPending || undo.isPending}
        onClick={() => {
          if (doneToday) undo.mutate(daily.id)
          else keep.mutate(daily.id)
        }}
      >
        {doneToday ? '✓' : needed > 1 ? `${String(doneCount)}/${String(needed)}` : ''}
      </Button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-sm',
            doneToday ? 'text-ink-500 line-through' : 'text-ink-50',
          )}
        >
          {daily.title}
        </p>
        {needed > 1 && expectedToday && (
          <p className="text-ink-700 text-xs">
            {doneCount} of {needed} today
          </p>
        )}
        {!expectedToday && <p className="text-ink-700 text-xs">Not due today</p>}
      </div>

      {view.streak > 0 && (
        <span className="text-ink-500 numeric flex items-center gap-1 text-xs">
          <Flame size={12} aria-hidden />
          {view.streak}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        aria-label={`Move ${daily.title} back to Today`}
        disabled={moveHome.isPending}
        onClick={() => {
          moveHome.mutate({ id: daily.id, home: undefined })
        }}
      >
        <Undo2 size={14} aria-hidden />
      </Button>
    </li>
  )
}

function Upkeep() {
  const upkeep = useUpkeep()
  const [adding, setAdding] = useState(false)

  const views = upkeep.data ?? []

  return (
    <Section
      title="Upkeep"
      description="Brushing, flossing, washing your hair — the body's chores"
      action={
        <Button
          variant={adding ? 'ghost' : 'outline'}
          size="sm"
          onClick={() => {
            setAdding(!adding)
          }}
        >
          {adding ? 'Close' : 'Add'}
        </Button>
      }
    >
      {adding && (
        <AddDaily
          home={UPKEEP}
          placeholder="Something you keep on top of"
          onDone={() => {
            setAdding(false)
          }}
        />
      )}

      <Card>
        {upkeep.data === undefined ? null : views.length === 0 ? (
          <Empty title="Nothing yet">
            Twice-a-day things belong here too — set how many times and each tap logs one.
          </Empty>
        ) : (
          <ul className="divide-ink-800 divide-y">
            {views.map((view) => (
              <UpkeepRow key={view.daily.id} view={view} />
            ))}
          </ul>
        )}
      </Card>
    </Section>
  )
}

export function VitalsPage() {
  const vices = useVices()
  const add = useAddVice()
  const now = useServices().clock.now()

  const taken = new Set((vices.data ?? []).map((vice) => vice.name.toLowerCase()))
  const unused = SUGGESTIONS.filter((one) => !taken.has(one.name.toLowerCase()))

  return (
    <div className="space-y-4">
      <PageHeader title="Vitals" subtitle="What the body is doing, and what you have left" />

      <Section
        title="Charges"
        description="Things you mean to have less of, as a pool that comes back"
      >
        <Card>
          {vices.data === undefined ? null : vices.data.length === 0 ? (
            <Empty title="Nothing limited yet">
              A limit as a rule has two states, kept and broken. A limit as a resource has as many
              states as it has charges — the question stops being whether you were good and becomes
              what you have left.
            </Empty>
          ) : (
            <ul className="divide-ink-800 mb-3 divide-y">
              {vices.data.map((vice) => (
                <ViceRow key={vice.id} vice={vice} now={now} />
              ))}
            </ul>
          )}

          {/*
            Offered by *name not already used* rather than only on an
            empty list. Gating on emptiness meant adding coffee took the
            other two away, so the second and third pool had to be typed
            out — which is the opposite of what a suggestion is for.
          */}
          {unused.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {unused.map((suggestion) => (
                <Button
                  key={suggestion.name}
                  variant="outline"
                  size="sm"
                  disabled={add.isPending}
                  onClick={() => {
                    add.mutate(suggestion)
                  }}
                >
                  <Plus size={14} aria-hidden />
                  {suggestion.name}
                </Button>
              ))}
            </div>
          )}

          <AddVice />
        </Card>
      </Section>

      <Section title="Phase" description="Where the scale is meant to be going">
        <PhaseEditor />
      </Section>

      <Section title="Macros" description="Derived from the scale, not from a formula">
        <MacroTargetsCard />
      </Section>

      <Upkeep />

      <Section title="Condition" description="How the day feels, and what it does to the session">
        <ConditionEditor />
      </Section>
    </div>
  )
}
