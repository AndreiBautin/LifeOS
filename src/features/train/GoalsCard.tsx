import { Flag, X } from 'lucide-react'
import { useId, useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import { goalStanding, type GoalStanding, type LiftGoal } from '@/domain/strength/goal'
import { strengthTrend, type TrendLift, type TrendPoint } from '@/domain/strength/trend'
import { parseDay, shiftDay, toDayKey } from '@/domain/time/day'
import { Button, Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { useRecentWorkouts } from './hooks'

/**
 * A goal per competition lift, with a date, and whether the lift is on
 * course for it.
 *
 * **Its picture is a glide path**: the straight line the goal asks for,
 * from where the lift stood the day it was set to the target on the
 * date; the line the sessions actually drew since; and the trend carried
 * forward to the date. Above the dashed line is ahead of the goal — one
 * look, no arithmetic. The words under it give the arithmetic anyway
 * (`goalStanding`), because "behind" without how far is a feeling.
 *
 * Colours are the Strength card's, so a lift is one colour everywhere.
 */
const LIFTS: readonly {
  readonly lift: TrendLift
  readonly name: string
  readonly colour: string
}[] = [
  { lift: 'squat', name: 'Squat', colour: 'var(--color-accent-400)' },
  { lift: 'bench', name: 'Bench press', colour: 'var(--color-cool-500)' },
  { lift: 'deadlift', name: 'Deadlift', colour: 'var(--color-warn-500)' },
]

export function GoalsCard() {
  const { settings, update } = useSettings()
  const today = toDayKey(useServices().clock.now())
  const workouts = useRecentWorkouts(200)
  const trend = workouts.data === undefined ? undefined : strengthTrend(workouts.data)
  const goals = settings.liftGoals ?? {}

  const setGoal = (lift: TrendLift, goal: LiftGoal | undefined) => {
    const others = Object.fromEntries(Object.entries(goals).filter(([one]) => one !== lift))
    update({ liftGoals: goal === undefined ? others : { ...others, [lift]: goal } })
  }

  return (
    <Card>
      <CardHeading icon={<Flag size={16} aria-hidden />} title="Goals" />
      <ul className="space-y-5">
        {LIFTS.map(({ lift, name, colour }) => {
          const points = trend?.[lift] ?? []
          const now =
            points.at(-1)?.value ?? settings.estimatedMaxes[asExerciseId(STRENGTH_LIFT_SLUGS[lift])]
          const goal = goals[lift]
          return (
            <li key={lift}>
              {goal === undefined ? (
                <GoalForm
                  name={name}
                  colour={colour}
                  now={now}
                  today={today}
                  onSave={(load, by) => {
                    setGoal(lift, { load, by, setOn: today, from: now ?? 0 })
                  }}
                />
              ) : (
                <GoalRow
                  name={name}
                  colour={colour}
                  goal={goal}
                  points={points}
                  today={today}
                  standing={goalStanding(points, goal, today)}
                  onClear={() => {
                    setGoal(lift, undefined)
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Swatch({ colour }: { readonly colour: string }) {
  return <span className="size-2 rounded-full" style={{ background: colour }} aria-hidden />
}

function GoalRow({
  name,
  colour,
  goal,
  points,
  today,
  standing,
  onClear,
}: {
  readonly name: string
  readonly colour: string
  readonly goal: LiftGoal
  readonly points: readonly TrendPoint[]
  readonly today: string
  readonly standing: GoalStanding
  readonly onClear: () => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-100 flex items-center gap-2 text-sm font-medium">
          <Swatch colour={colour} />
          {name}
        </span>
        <span className="flex items-center gap-1">
          <span className="numeric text-ink-50 text-sm font-semibold">
            {goal.load} lb{' '}
            <span className="text-ink-500 font-normal">by {shortDay(goal.by, today)}</span>
          </span>
          <Button variant="ghost" size="sm" aria-label={`Clear the ${name} goal`} onClick={onClear}>
            <X size={14} aria-hidden />
          </Button>
        </span>
      </div>
      <GlidePath goal={goal} points={points} today={today} standing={standing} colour={colour} />
      <p className={cn('mt-1 text-xs', toneOf(standing))}>{sentence(standing, goal, today)}</p>
    </div>
  )
}

/** The goal's line, the lift's line, and the lift's line carried forward. */
function GlidePath({
  goal,
  points,
  today,
  standing,
  colour,
}: {
  readonly goal: LiftGoal
  readonly points: readonly TrendPoint[]
  readonly today: string
  readonly standing: GoalStanding
  readonly colour: string
}) {
  const W = 300
  const H = 64
  const PAD = 6
  const start = parseDay(goal.setOn).getTime()
  const span = Math.max(1, parseDay(goal.by).getTime() - start)
  const since = points.filter((point) => point.date >= goal.setOn && point.date <= goal.by)
  const actual = [{ date: goal.setOn, value: goal.from }, ...since]
  const projected =
    standing.kind === 'on-pace' || standing.kind === 'behind' ? standing.projected : undefined

  const values = [goal.from, goal.load, ...since.map((point) => point.value)]
  if (projected !== undefined) values.push(projected)
  const low = Math.min(...values)
  const range = Math.max(1, Math.max(...values) - low)

  const x = (day: string) => PAD + ((parseDay(day).getTime() - start) / span) * (W - PAD * 2)
  const y = (value: number) => H - PAD - ((value - low) / range) * (H - PAD * 2)
  const last = actual.at(-1)
  const tone =
    standing.kind === 'behind' || standing.kind === 'missed'
      ? 'var(--color-warn-500)'
      : 'var(--color-good-500)'

  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="mt-2 h-16 w-full"
      role="img"
      aria-label={`Set at ${String(goal.from)} lb, aiming for ${String(goal.load)} lb, now ${String(last?.value ?? goal.from)} lb`}
    >
      {today > goal.setOn && today < goal.by && (
        <line
          x1={x(today)}
          x2={x(today)}
          y1={2}
          y2={H - 2}
          stroke="var(--color-ink-800)"
          strokeWidth={1}
        />
      )}
      {/* What the goal asks for. */}
      <line
        x1={x(goal.setOn)}
        y1={y(goal.from)}
        x2={x(goal.by)}
        y2={y(goal.load)}
        stroke="var(--color-ink-500)"
        strokeWidth={1.25}
        strokeDasharray="4 4"
      />
      {/* Where the trend carries the lift by the date. */}
      {projected !== undefined && last !== undefined && (
        <line
          x1={x(last.date)}
          y1={y(last.value)}
          x2={x(goal.by)}
          y2={y(projected)}
          stroke={tone}
          strokeWidth={1.5}
          strokeDasharray="1 4"
          strokeLinecap="round"
        />
      )}
      {/* What the sessions drew. */}
      <polyline
        points={actual
          .map((point) => `${String(x(point.date))},${String(y(point.value))}`)
          .join(' ')}
        fill="none"
        stroke={colour}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last !== undefined && <circle cx={x(last.date)} cy={y(last.value)} r={3} fill={colour} />}
      <circle
        cx={x(goal.by)}
        cy={y(goal.load)}
        r={4}
        fill="var(--color-ink-950)"
        stroke={colour}
        strokeWidth={2}
      />
    </svg>
  )
}

function GoalForm({
  name,
  colour,
  now,
  today,
  onSave,
}: {
  readonly name: string
  readonly colour: string
  readonly now: number | undefined
  readonly today: string
  readonly onSave: (load: number, by: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState('')
  const [by, setBy] = useState(shiftDay(today, 84))
  const id = useId()
  const parsed = Number(load)
  // A goal at or below where the lift already is would read as reached
  // the moment it was set, with a glide path running downhill.
  const valid = Number.isFinite(parsed) && parsed > (now ?? 0) && by > today

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-300 flex items-center gap-2 text-sm">
          <Swatch colour={colour} />
          {name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            /*
             * Offered, not imposed: ten pounds on in twelve weeks, both
             * editable. Filled on open rather than on mount, because the
             * trend loads after the card does and a default taken at mount
             * read the stored estimate — 145 for a bench sessions put at 245.
             */
            setLoad(now === undefined ? '' : String(Math.ceil(now / 5) * 5 + 10))
            setOpen(true)
          }}
        >
          Set a goal
        </Button>
      </div>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) onSave(parsed, by)
      }}
    >
      <p className="text-ink-100 flex items-center gap-2 text-sm font-medium">
        <Swatch colour={colour} />
        {name}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-load`} className="sr-only">
          Target load
        </label>
        <input
          id={`${id}-load`}
          type="number"
          inputMode="decimal"
          value={load}
          onChange={(event) => {
            setLoad(event.target.value)
          }}
          className="numeric bg-ink-850 border-ink-800 text-ink-50 tap-target w-24 rounded border px-2 py-1.5 text-right text-sm"
        />
        <span className="text-ink-500 text-xs">lb by</span>
        <label htmlFor={`${id}-by`} className="sr-only">
          Deadline
        </label>
        <input
          id={`${id}-by`}
          type="date"
          min={shiftDay(today, 1)}
          value={by}
          onChange={(event) => {
            setBy(event.target.value)
          }}
          className="bg-ink-850 border-ink-800 text-ink-50 tap-target rounded border px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={!valid}>
          Set goal
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
    </form>
  )
}

function toneOf(standing: GoalStanding): string {
  switch (standing.kind) {
    case 'met':
    case 'on-pace':
      return 'text-good-500'
    case 'behind':
    case 'missed':
      return 'text-warn-500'
    case 'unknown':
      return 'text-ink-500'
  }
}

function sentence(standing: GoalStanding, goal: LiftGoal, today: string): string {
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`
  switch (standing.kind) {
    case 'met':
      return `Reached — sessions measure ${String(standing.now)} lb.`
    case 'missed':
      return `${shortDay(goal.by, today)} has passed${
        standing.now === undefined ? '' : ` at ${String(standing.now)} lb`
      }. Set a new one.`
    case 'on-pace':
      return `On pace — about ${String(Math.round(standing.projected))} lb by ${shortDay(goal.by, today)}.`
    case 'behind':
      return `Behind — needs ${signed(standing.neededPerWeek)} lb a week, trending ${signed(standing.ratePerWeek)}.`
    case 'unknown':
      return `Needs ${signed(standing.neededPerWeek)} lb a week. A few more sessions and this can project.`
  }
}

/** "Mar 1", or "Mar 1, 2027" once it is another year. */
function shortDay(day: string, today: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}
