import { Flame, Plus, Scale, Undo2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useState } from 'react'

import { Button, Card, Empty, Section } from '@/components/shared/primitives'
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
import { UPKEEP } from '@/domain/base/base'
import type { DailyView } from '@/application/use-cases/dailies/dailies'

import { AddDaily, DailyTitle, RenameDaily } from '../today/Dailies'
import {
  useAddDaily,
  useKeepToday,
  useMoveDailyHome,
  useUndoToday,
  useUpkeep,
} from '../today/dailies-hooks'
import { projectCorridor } from '@/domain/vitals/weight'
import { TrendChart } from '@/components/shared/TrendChart'

import { useRecordCondition, useRecordWeighIn, useVitalsToday, useWeighIns } from './hooks'

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
  const keep = useKeepToday(view.daily.belongsTo)
  const undo = useUndoToday()
  const moveHome = useMoveDailyHome()
  const [renaming, setRenaming] = useState(false)

  const { daily, doneToday, expectedToday, doneCount, needed } = view

  if (renaming) {
    return (
      <li>
        <RenameDaily
          daily={daily}
          onDone={() => {
            setRenaming(false)
          }}
        />
      </li>
    )
  }

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
        <DailyTitle
          daily={daily}
          done={doneToday}
          onRename={() => {
            setRenaming(true)
          }}
        />
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

/**
 * The body's chores, offered by name.
 *
 * Upkeep was the one list in the app with no suggestions — you typed
 * every row — and it is the list whose contents are the least personal:
 * everybody's is roughly brushing, flossing, hair and water. Water is
 * the reason it exists now, since taking it off the pool suggestions
 * would otherwise have left the only way to it a form.
 *
 * `timesPerDay` is on brushing because two is what brushing is, and it
 * is the field `AddDaily` collects for exactly this.
 */
const UPKEEP_SUGGESTIONS: readonly {
  readonly title: string
  readonly timesPerDay?: number
}[] = [
  /*
   * Named for the thing being ticked rather than for the substance. A
   * daily has no rename — the title is fixed at creation — so a row
   * reading just 'Water' would be a checkbox against a question nobody
   * fails, where the whole point is whether the day's target was
   * finished.
   */
  { title: 'Gallon of water' },
  { title: 'Brush teeth', timesPerDay: 2 },
  { title: 'Floss' },
  { title: 'Wash hair' },
]

function UpkeepSuggestions({ taken }: { readonly taken: ReadonlySet<string> }) {
  const add = useAddDaily(UPKEEP)

  /*
   * Offered by *name not already used*, the same rule the pools follow.
   * Gating on an empty list instead means adding the first one takes the
   * other three away, so the second has to be typed — which is the
   * opposite of what a suggestion is for.
   */
  const unused = UPKEEP_SUGGESTIONS.filter((one) => !taken.has(one.title.toLowerCase()))
  if (unused.length === 0) return null

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {unused.map((suggestion) => (
        <Button
          key={suggestion.title}
          variant="outline"
          size="sm"
          disabled={add.isPending}
          onClick={() => {
            add.mutate({
              title: suggestion.title,
              cadence: { kind: 'every-day' },
              ...(suggestion.timesPerDay === undefined
                ? {}
                : { timesPerDay: suggestion.timesPerDay }),
            })
          }}
        >
          <Plus size={14} aria-hidden />
          {suggestion.title}
        </Button>
      ))}
    </div>
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
            Things you either did today or did not — a gallon of water, brushing, flossing.
          </Empty>
        ) : (
          <ul className="divide-ink-800 mb-3 divide-y">
            {views.map((view) => (
              <UpkeepRow key={view.daily.id} view={view} />
            ))}
          </ul>
        )}

        <UpkeepSuggestions
          taken={new Set(views.map((view) => view.daily.title.trim().toLowerCase()))}
        />
      </Card>
    </Section>
  )
}

export function VitalsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Vitals" subtitle="What the body is doing" />

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
