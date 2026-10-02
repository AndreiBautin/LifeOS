import { History } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { useSettings } from '@/app/context'
import { asExerciseId } from '@/domain/ids/ids'
import type { ExerciseSeries, ExerciseSession } from '@/domain/logging/exercise-history'
import type { Performance } from '@/domain/logging/versus-last'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, CardHeading } from '@/components/shared/primitives'
import { useExerciseHistory, useExercises } from '@/features/train/hooks'

import { StallCard } from './StallCard'
import { splitDayLabel } from '@/features/train/useNextSession'

/**
 * One exercise, across every session that did it.
 *
 * Reached from its name wherever a past or planned session shows it. It
 * answers the questions the session screens cannot: how long have I been
 * at this weight, what is the best I have done, and when did it last move.
 */
export function ExercisePage() {
  const { id = '' } = useParams()
  const exerciseId = asExerciseId(id)
  const { settings } = useSettings()
  const exercises = useExercises()
  const exercise = exercises.data?.find((one) => one.id === exerciseId)

  const history = useExerciseHistory(exerciseId)

  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const series = history.data ?? []
  const named = series.filter((one) => one.variant !== undefined)
  const shown =
    series.find((one) => one.variant === chosen) ??
    // A version the lifter does now leads over the history from before it.
    named.at(0) ??
    series.at(0)

  const bodyweight = exercise?.loadBasis === 'bodyweight'
  const title = exercise?.name ?? 'Exercise'

  if (history.data === undefined) return <PageHeader title={title} subtitle="Loading…" />

  if (shown === undefined) {
    return (
      <>
        <PageHeader title={title} />
        <Card>
          <p className="text-ink-300 text-sm">
            Not done yet. Its history starts with the first set you log.
          </p>
        </Card>
      </>
    )
  }

  const latest = shown.sessions.at(-1)
  const first = shown.sessions[0]
  const estimate = [...shown.sessions].reverse().find((one) => one.estimate !== undefined)

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-8">
      <PageHeader
        title={title}
        subtitle={`${String(shown.sessions.length)} ${shown.sessions.length === 1 ? 'session' : 'sessions'}${
          first === undefined ? '' : ` since ${monthYear(first.date)}`
        }`}
      />

      {series.length > 1 && (
        <div className="flex gap-1.5" role="group" aria-label="Version">
          {series.map((one) => {
            const label = one.variant ?? 'Earlier'
            const active = one === shown
            return (
              <Button
                key={label}
                variant={active ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={active}
                onClick={() => {
                  setChosen(one.variant)
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      )}

      <StallCard exerciseId={exerciseId} series={shown} bodyweight={bodyweight} />

      <section className="hero-panel p-5 sm:p-6" aria-label="Progress">
        <dl className="grid grid-cols-3 gap-3">
          <Figure label="Best set" value={describe(shown.best, settings.units, bodyweight)} />
          <Figure
            label="Last time"
            value={latest === undefined ? '—' : describe(latest.top, settings.units, bodyweight)}
          />
          <Figure
            label={estimate === undefined ? 'Sessions' : 'Est. max'}
            value={
              estimate?.estimate === undefined
                ? String(shown.sessions.length)
                : formatLoad(estimate.estimate, settings.units)
            }
          />
        </dl>
        <Staircase series={shown} bodyweight={bodyweight} units={settings.units} />
      </section>

      <SessionList sessions={shown.sessions} units={settings.units} bodyweight={bodyweight} />
    </div>
  )
}

function Figure({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500 text-[0.7rem] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="numeric text-ink-50 mt-1 truncate text-base font-semibold sm:text-lg">
        {value}
      </dd>
    </div>
  )
}

/** The newest sessions the staircase can draw legibly on a phone. */
const STEPS = 16

/**
 * **Double progression, drawn as what it is.** The bar holds while the
 * reps climb, then steps up and the reps fall back — so the top-set load
 * is a staircase, not a curve, and the reps underneath each step are the
 * part that shows the work. Sessions are spaced evenly rather than by
 * date: a fortnight off is not a step, and spacing by time would squeeze
 * a busy month into a corner.
 *
 * A bodyweight movement holds no load to step, so its staircase is the
 * reps themselves.
 */
function Staircase({
  series,
  bodyweight,
  units,
}: {
  readonly series: ExerciseSeries
  readonly bodyweight: boolean
  readonly units: WeightUnit
}) {
  const sessions = series.sessions.slice(-STEPS)
  const loads = sessions.map((one) => one.top.load ?? 0)
  const byReps = bodyweight && loads.every((load) => load <= 0)
  const values = sessions.map((one) => (byReps ? (one.top.reps ?? 0) : (one.top.load ?? 0)))
  if (sessions.length < 2) return null

  const W = 600
  const H = 170
  const pad = { top: 30, right: 12, bottom: byReps ? 10 : 40, left: 12 }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = Math.max(1, high - low)
  const step = (W - pad.left - pad.right) / sessions.length
  const x = (i: number) => pad.left + i * step
  const y = (v: number) => pad.top + (1 - (v - low) / span) * (H - pad.top - pad.bottom - 18)

  const path = values
    .map(
      (v, i) =>
        `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)} H${x(i + 1).toFixed(1)}`,
    )
    .join(' ')

  return (
    <figure className="mt-5">
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${byReps ? 'Reps' : 'Top-set load'} over the last ${String(sessions.length)} sessions, from ${String(values[0])} to ${String(values.at(-1))}`}
      >
        <path
          className="line-draw"
          d={path}
          pathLength={1}
          fill="none"
          stroke="var(--color-accent-400)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {/* The bar at each end, written on the step it labels. */}
        <text x={x(0)} y={y(values[0] ?? 0) - 16} fontSize={17} fill="var(--color-ink-500)">
          {byReps ? `${String(values[0])} reps` : formatLoad(values[0] ?? 0, units)}
        </text>
        <text
          x={W - pad.right}
          y={y(values.at(-1) ?? 0) - 12}
          fontSize={19}
          fontWeight={700}
          textAnchor="end"
          fill="var(--color-ink-50)"
        >
          {byReps ? `${String(values.at(-1))} reps` : formatLoad(values.at(-1) ?? 0, units)}
        </text>
        {values.map((v, i) => {
          const next = values[i + 1]
          const stepped = next !== undefined && next > v
          return (
            <g key={i}>
              {stepped && (
                <circle
                  cx={x(i + 1)}
                  cy={y(next)}
                  r={4}
                  fill="var(--color-accent-400)"
                  style={{ filter: 'drop-shadow(0 0 4px var(--color-accent-400))' }}
                />
              )}
              {!byReps && (
                <text
                  x={x(i) + step / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={19}
                  fontWeight={stepped ? 700 : 500}
                  fill={stepped ? 'var(--color-accent-400)' : 'var(--color-ink-500)'}
                >
                  {sessions[i]?.top.reps ?? ''}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption className="text-ink-500 mt-1 text-xs">
        {byReps
          ? 'Reps on the top set, session by session.'
          : 'Reps under each step, lit where they earned the next load.'}
      </figcaption>
    </figure>
  )
}

const SHOWN = 8

function SessionList({
  sessions,
  units,
  bodyweight,
}: {
  readonly sessions: readonly ExerciseSession[]
  readonly units: WeightUnit
  readonly bodyweight: boolean
}) {
  const [all, setAll] = useState(false)
  const newest = [...sessions].reverse()
  const visible = all ? newest : newest.slice(0, SHOWN)

  return (
    <Card>
      <CardHeading icon={<History size={16} aria-hidden />} title="Sessions" />
      <ul className="divide-ink-800/70 divide-y">
        {visible.map((session) => (
          <li key={`${session.workoutId}-${session.date}`}>
            <Link
              viewTransition
              to={`/session/${session.workoutId}`}
              className="hover:bg-ink-800/40 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5"
            >
              <span className="min-w-0">
                <span className="text-ink-100 block text-sm">{shortDate(session.date)}</span>
                <span className="text-ink-500 block truncate text-xs">
                  {splitDayLabel(session.title).name}
                </span>
              </span>
              <span className="numeric text-ink-300 shrink-0 text-right text-xs">
                {summarise(session.sets, units, bodyweight)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {newest.length > SHOWN && (
        <Button
          variant="ghost"
          full
          className="mt-2"
          onClick={() => {
            setAll(!all)
          }}
        >
          {all ? 'Show fewer' : `Show all ${String(newest.length)}`}
        </Button>
      )}
    </Card>
  )
}

function loadText(load: number | undefined, units: WeightUnit, bodyweight: boolean): string {
  if (bodyweight) return load === undefined || load <= 0 ? 'BW' : `BW + ${formatLoad(load, units)}`
  return load === undefined ? '—' : formatLoad(load, units)
}

function describe(set: Performance, units: WeightUnit, bodyweight: boolean): string {
  return `${loadText(set.load, units, bodyweight)} × ${String(set.reps ?? '—')}`
}

/**
 * "165 lb × 8, 8, 7" when every set shared a bar — which under double
 * progression is nearly always — and each set written out when not.
 */
function summarise(sets: readonly Performance[], units: WeightUnit, bodyweight: boolean): string {
  const loads = new Set(sets.map((set) => set.load ?? 0))
  if (loads.size === 1) {
    return `${loadText(sets[0]?.load, units, bodyweight)} × ${sets.map((set) => String(set.reps ?? '—')).join(', ')}`
  }
  return sets.map((set) => describe(set, units, bodyweight)).join(' · ')
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function monthYear(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}
