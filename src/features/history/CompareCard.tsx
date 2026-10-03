import { GitCompareArrows } from 'lucide-react'
import { useState } from 'react'

import type { Exercise } from '@/domain/exercises/exercise'
import { compareSessions } from '@/domain/logging/compare'
import { dayNameOf } from '@/domain/logging/history-filter'
import type { Performance } from '@/domain/logging/versus-last'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Card, CardHeading } from '@/components/shared/primitives'
import { useRecentWorkouts } from '@/features/train/hooks'
import { VersusChip } from '@/features/train/VersusChip'

/**
 * This session against another, exercise by exercise (`compareSessions`).
 *
 * **A butterfly**: the other session's volume grows left from a centre
 * line, this one's grows right, on one scale, so which side of the line is
 * longer is the answer before any number is read. Under each, the two top
 * sets and the usual chip for how this one stands.
 *
 * The other session defaults to **the last time this day was run** — the
 * comparison the lifter actually wants — and can be changed to any
 * finished session.
 */
export function CompareCard({
  workout,
  library,
  units,
}: {
  readonly workout: WorkoutLog
  readonly library: readonly Exercise[]
  readonly units: WeightUnit
}) {
  const recent = useRecentWorkouts(200)
  const others = (recent.data ?? []).filter(
    (log) => log.status === 'completed' && log.id !== workout.id,
  )
  const sameDay = others.filter(
    (log) => dayNameOf(log.title) === dayNameOf(workout.title) && log.startedAt < workout.startedAt,
  )
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const other =
    others.find((log) => log.id === chosen) ??
    sameDay.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  if (other === undefined) return null

  const rows = compareSessions(workout, other)
  const most = Math.max(
    1,
    ...rows.flatMap((row) => [row.here?.volume ?? 0, row.there?.volume ?? 0]),
  )
  const nameOf = (id: string) => library.find((one) => one.id === id)?.name ?? id
  const half = (volume: number | undefined) => `${String(((volume ?? 0) / most) * 100)}%`

  return (
    <Card>
      <CardHeading icon={<GitCompareArrows size={16} aria-hidden />} title="Against" />
      <label className="mb-4 block">
        <span className="sr-only">Compare with</span>
        <select
          value={other.id}
          onChange={(event) => {
            setChosen(event.target.value)
          }}
          className="border-ink-800 bg-ink-850 text-ink-100 tap-target w-full rounded-lg border px-2 text-sm"
        >
          {others.slice(0, 40).map((log) => (
            <option key={log.id} value={log.id}>
              {shortDate(log.date)} · {dayNameOf(log.title)}
            </option>
          ))}
        </select>
      </label>

      <div className="text-ink-500 mb-2 grid grid-cols-2 text-[0.7rem]">
        <span>{shortDate(other.date)}</span>
        <span className="text-right">This session</span>
      </div>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.exerciseId}>
            <p className="text-ink-100 mb-1 truncate text-center text-xs font-medium">
              {nameOf(row.exerciseId)}
            </p>
            <div className="grid grid-cols-2 gap-px" aria-hidden>
              <span className="flex justify-end">
                <span
                  className="bg-ink-500/60 h-2.5 rounded-l-full"
                  style={{ width: half(row.there?.volume) }}
                />
              </span>
              <span className="border-ink-500 flex border-l">
                <span
                  className="bg-accent-500 h-2.5 rounded-r-full"
                  style={{ width: half(row.here?.volume) }}
                />
              </span>
            </div>
            <div className="numeric mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
              <span className="text-ink-500">{describeTop(row.there?.top, units)}</span>
              {row.versus === undefined ? (
                <span />
              ) : (
                <VersusChip versus={row.versus} units={units} />
              )}
              <span className="text-ink-100 text-right">{describeTop(row.here?.top, units)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function describeTop(top: Performance | undefined, units: WeightUnit): string {
  if (top === undefined) return '—'
  const load = top.load === undefined || top.load <= 0 ? 'BW' : formatLoad(top.load, units)
  return `${load} × ${String(top.reps ?? '—')}`
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
