import { Link } from 'react-router-dom'

import { useSettings } from '@/app/context'
import { Card } from '@/components/shared/primitives'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { workingSets } from '@/domain/logging/workout-log'
import { formatLoad } from '@/domain/units/weight'

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
 * **The heaviest working set that session, not a count of sets.** It
 * shipped counting working sets first, and that was the wrong axis:
 * reported plainly, *"just having sets logged in training history isn't
 * that useful cause I just see a bar chart with 10 everyday — my daily
 * volume stays pretty consistent anyway."* True by design — the
 * assembler targets a fixed set count per muscle per session, so a
 * chart of set counts was always going to be flat regardless of how
 * training was actually going. Load is not fixed the same way: RTS
 * autoregulates it set by set specifically so it climbs as the lifter
 * progresses, so the heaviest completed, non-warm-up load logged that
 * day is the one number on this screen that is *supposed* to trend
 * rather than hold steady. `workingSets` is still the domain's own
 * filter for "completed and not a warm-up"; this just reads
 * `actualLoad` off what it returns instead of counting it.
 *
 * **Silent under two sessions.** One bar cannot show a trend, and a
 * chart claiming to compare sessions with only one to show would be
 * reporting a fact about the fixture rather than about training.
 *
 * **A unit caption and a per-bar title.** The caption states what the
 * bars measure once; the `title` attribute puts each session's own name
 * on the bar itself, reachable by hover or by a screen reader, without
 * spending permanent space on it in a chart this narrow.
 */

function height(load: number, max: number): number {
  if (max <= 0) return 4
  return Math.max(4, Math.round((load / max) * 64))
}

function label(log: WorkoutLog): string {
  const on = new Date(log.date)
  return on.toLocaleDateString('en-US', { weekday: 'short' })
}

/** The heaviest completed, non-warm-up load logged anywhere in the session. */
function topLoad(log: WorkoutLog): number {
  return log.entries.reduce((sessionMax, entry) => {
    const entryMax = workingSets(entry).reduce(
      (setMax, set) => Math.max(setMax, set.actualLoad ?? 0),
      0,
    )
    return Math.max(sessionMax, entryMax)
  }, 0)
}

export function RecentTraining() {
  const recent = useRecentWorkouts(6)
  const { settings } = useSettings()
  const data = recent.data

  if (data === undefined) return null

  /*
   * Oldest to newest, left to right — a bar chart reads as a timeline
   * only when time runs the way text does. `recent()` returns newest
   * first, which is right for a list and backwards for this.
   */
  const sessions = [...data].filter((log) => log.status !== 'in-progress').reverse()
  if (sessions.length < 2) return null

  const loads = sessions.map(topLoad)
  const max = Math.max(...loads)

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-ink-50 font-medium">Recent training</h2>
        <Link to="/history" className="text-ink-500 hover:text-ink-300 shrink-0 text-xs">
          History →
        </Link>
      </div>
      <p className="text-ink-700 mt-0.5 text-xs">Heaviest working set, oldest to newest</p>

      <div className="mt-4 flex items-end justify-between gap-2" style={{ height: 64 }}>
        {sessions.map((log, index) => {
          const abandoned = log.status === 'abandoned'
          const load = loads[index] ?? 0
          return (
            <div
              key={log.id}
              className="flex flex-1 flex-col items-center justify-end gap-1.5"
              title={`${log.title} — ${formatLoad(load, settings.units)}`}
            >
              <span className="text-ink-500 numeric text-[10px]">{Math.round(load)}</span>
              <div
                className="meter-fill w-full rounded-t-sm"
                style={{
                  height: height(load, max),
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
