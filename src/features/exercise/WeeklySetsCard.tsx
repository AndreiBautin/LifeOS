import { BarChart2 } from 'lucide-react'

import { useServices, useSettings } from '@/app/context'
import { setsByWeek, type ExerciseSession } from '@/domain/logging/exercise-history'
import { toDayKey } from '@/domain/time/day'
import { Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

const WEEKS = 12

/**
 * Twelve weeks of an exercise as **towers of sets**: a column per
 * calendar week, a block per working set, so "how often have I done this
 * lately" is counted by eye — three blocks is three sets — where a bar's
 * height would have to be read against an axis. A week with none is an
 * empty column, which is the point; this week is outlined.
 */
export function WeeklySetsCard({ sessions }: { readonly sessions: readonly ExerciseSession[] }) {
  const { settings } = useSettings()
  const today = toDayKey(useServices().clock.now())
  const weeks = setsByWeek(sessions, today, WEEKS)
  const tallest = Math.max(1, ...weeks.map((week) => week.sets))
  const total = weeks.reduce((sum, week) => sum + week.sets, 0)
  const trained = weeks.filter((week) => week.sets > 0).length

  return (
    <Card>
      <CardHeading icon={<BarChart2 size={16} aria-hidden />} title="Sets by week" />
      <p className="text-ink-300 numeric mb-3 text-sm">
        <span className="text-ink-50 font-semibold">{total}</span> sets in{' '}
        <span className="text-ink-50 font-semibold">{trained}</span> of the last {WEEKS} weeks
      </p>
      <ol
        className="grid h-28 items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${String(WEEKS)}, minmax(0, 1fr))` }}
      >
        {weeks.map((week, index) => (
          <li
            key={week.monday}
            className={cn(
              'flex h-full flex-col-reverse gap-[3px] rounded-md p-[2px]',
              index === weeks.length - 1 && 'ring-ink-700 ring-1',
            )}
            aria-label={`Week of ${week.monday}: ${String(week.sets)} sets, ${Math.round(week.volume).toLocaleString()} ${settings.units}`}
          >
            {Array.from({ length: week.sets }, (_, block) => (
              <span
                key={block}
                className="bg-accent-500 rounded-[3px]"
                style={{
                  height: `calc((100% - ${String((tallest - 1) * 3)}px) / ${String(tallest)})`,
                  opacity: 0.55 + (0.45 * (block + 1)) / tallest,
                }}
              />
            ))}
          </li>
        ))}
      </ol>
      <div className="text-ink-500 mt-1.5 flex justify-between text-[0.65rem]">
        <span>{WEEKS} weeks ago</span>
        <span>This week</span>
      </div>
    </Card>
  )
}
