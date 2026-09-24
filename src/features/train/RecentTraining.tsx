import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { workingSets } from '@/domain/logging/workout-log'

import { useRecentWorkouts } from './hooks'

/**
 * The last few sessions, as bars rather than a list.
 *
 * **A real content card, not a `lg`-only decoration** — the other three
 * (`TraitRadar`, `CampaignPath`, `ChallengeRing`) are second readings of
 * data already on screen, gated to wide windows because the bars and
 * text beside them already say the same thing. This says something
 * nothing else on Today does: how the last few sessions compare. It
 * earns a permanent place on every width, the same footing
 * `ActiveQuests` and `ChallengePass` already stand on.
 *
 * **Working sets, not volume in pounds.** A count of completed,
 * non-warm-up sets is comparable across a squat day and an upper day in
 * a way a load total is not — a heavy triple and a set of fifteen curls
 * would otherwise be added together as if they meant the same thing.
 * `workingSets` is the domain's own predicate, reused rather than
 * reimplemented here.
 *
 * **Silent under two sessions.** One bar cannot show a trend, and a
 * chart claiming to compare sessions with only one to show would be
 * reporting a fact about the fixture rather than about training.
 *
 * **A unit caption and a per-bar title, added after "recent training
 * still makes no sense with just blocks."** Fair — a bar chart with a
 * number over each bar and a weekday under it says nothing about what
 * the number counts unless you already know. The caption states it
 * once; the `title` attribute puts each session's own name (`"Wednesday
 * — Full body"`) on the bar itself, reachable by hover or by a screen
 * reader, without spending permanent space on it in a chart this
 * narrow.
 */

function height(sets: number, max: number): number {
  if (max <= 0) return 4
  return Math.max(4, Math.round((sets / max) * 64))
}

function label(log: WorkoutLog): string {
  const on = new Date(log.date)
  return on.toLocaleDateString('en-US', { weekday: 'short' })
}

export function RecentTraining() {
  const recent = useRecentWorkouts(6)
  const data = recent.data

  if (data === undefined) return null

  /*
   * Oldest to newest, left to right — a bar chart reads as a timeline
   * only when time runs the way text does. `recent()` returns newest
   * first, which is right for a list and backwards for this.
   */
  const sessions = [...data].filter((log) => log.status !== 'in-progress').reverse()
  if (sessions.length < 2) return null

  const sets = sessions.map((log) => log.entries.reduce((sum, e) => sum + workingSets(e).length, 0))
  const max = Math.max(...sets)

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink-50 font-medium">Recent training</h2>
        <Link to="/history" className="text-ink-500 hover:text-ink-300 shrink-0 text-xs">
          History →
        </Link>
      </div>
      <p className="text-ink-700 mt-0.5 text-xs">Working sets logged, oldest to newest</p>

      <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 64 }}>
        {sessions.map((log, index) => {
          const abandoned = log.status === 'abandoned'
          return (
            <div
              key={log.id}
              className="flex flex-1 flex-col items-center justify-end gap-1.5"
              title={`${log.title} — ${String(sets[index])} working sets`}
            >
              <span className="text-ink-500 numeric text-[10px]">{sets[index]}</span>
              <div
                className="meter-fill w-full rounded-t-sm"
                style={{
                  height: height(sets[index] ?? 0, max),
                  backgroundColor: abandoned
                    ? 'var(--color-ink-700)'
                    : index === sessions.length - 1
                      ? 'var(--color-accent-500)'
                      : 'color-mix(in oklab, var(--color-accent-500) 55%, var(--color-ink-800))',
                }}
              />
            </div>
          )
        })}
      </div>

      <div className="mt-1.5 flex justify-between gap-2">
        {sessions.map((log) => (
          <span key={log.id} className="text-ink-700 flex-1 text-center text-[10px]">
            {label(log)}
          </span>
        ))}
      </div>
    </Card>
  )
}
