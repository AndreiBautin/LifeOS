import { useState } from 'react'

import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId } from '@/domain/ids/ids'
import type { ProgramWeek } from '@/domain/programs/program'
import { attributeWeek } from '@/domain/volume/attribution'
import { cn } from '@/lib/cn'
import { splitDayLabel } from '@/features/train/useNextSession'

/**
 * The week's direct sets as a grid: a row per muscle, a column per day.
 *
 * It replaced a list of "8 / 8" — every muscle measured against a
 * target that *is* the routine, so every row agreed with itself and said
 * nothing. What the routine does decide, and what a lifter actually asks
 * of it, is how much each muscle gets **and on which days**: whether the
 * triceps are hit once hard or twice, and whether two days in a row load
 * the same thing. A lit cell answers both at a glance, brighter for more
 * sets, with the week's total at the end of the row.
 *
 * Each day is counted by `attributeWeek` over that day alone — the same
 * arithmetic as the total, so a cell and its row cannot disagree. Tap a
 * muscle to see the exercises behind it.
 */
export function MuscleWeekGrid({
  week,
  lookup,
}: {
  readonly week: ProgramWeek
  readonly lookup: (id: ExerciseId) => Exercise | undefined
}) {
  const [open, setOpen] = useState<string | undefined>(undefined)

  const totals = attributeWeek(week, lookup).filter((entry) => entry.total > 0)
  const days = week.days.map((day) => ({
    day,
    byMuscle: new Map(
      attributeWeek({ ...week, days: [day] }, lookup).map((entry) => [entry.muscle, entry.total]),
    ),
  }))
  const rows = [...totals].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
  const peak = Math.max(1, ...days.flatMap(({ byMuscle }) => [...byMuscle.values()]))
  const columns = `minmax(0, 7rem) repeat(${String(days.length)}, minmax(0, 1fr)) 2.25rem`

  return (
    <div role="table" aria-label="Direct sets per muscle, by day">
      <div
        role="row"
        className="grid items-end gap-1.5 pb-1.5"
        style={{ gridTemplateColumns: columns }}
      >
        <span role="columnheader" aria-label="Muscle" />
        {days.map(({ day }) => (
          <span
            key={day.index}
            role="columnheader"
            className="text-ink-500 text-center text-[0.65rem] font-semibold tracking-[0.1em] uppercase"
          >
            {(splitDayLabel(day.label).weekday ?? '').slice(0, 3) || String(day.index + 1)}
          </span>
        ))}
        <span
          role="columnheader"
          className="text-ink-500 text-right text-[0.65rem] font-semibold tracking-[0.1em] uppercase"
        >
          Wk
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((entry) => {
          const isOpen = open === entry.muscle
          return (
            <div key={entry.muscle}>
              <button
                type="button"
                role="row"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? undefined : entry.muscle)
                }}
                className="hover:bg-ink-800/40 grid w-full items-center gap-1.5 rounded-lg py-0.5 text-left transition-colors"
                style={{ gridTemplateColumns: columns }}
              >
                <span role="rowheader" className="text-ink-300 truncate pl-1 text-sm">
                  {entry.label}
                </span>
                {days.map(({ day, byMuscle }) => {
                  const sets = byMuscle.get(entry.muscle) ?? 0
                  return (
                    <span
                      key={day.index}
                      role="cell"
                      className="flex h-8 items-center justify-center"
                    >
                      {sets > 0 ? (
                        <span
                          className="numeric flex size-8 items-center justify-center rounded-lg text-xs font-semibold"
                          style={{
                            background: `color-mix(in oklab, var(--color-accent-400) ${String(Math.round(18 + (sets / peak) * 62))}%, transparent)`,
                            color:
                              sets / peak > 0.55 ? 'var(--color-ink-950)' : 'var(--color-ink-50)',
                          }}
                          aria-label={`${String(sets)} sets`}
                        >
                          {sets}
                        </span>
                      ) : (
                        <span className="bg-ink-800 size-1.5 rounded-full" aria-label="none" />
                      )}
                    </span>
                  )
                })}
                <span
                  role="cell"
                  className="numeric text-ink-50 pr-1 text-right text-sm font-semibold"
                >
                  {entry.total}
                </span>
              </button>

              {isOpen && (
                <ul className="border-ink-800 mt-1 mb-2 ml-2 space-y-1 border-l pl-3">
                  {entry.contributions.map((contribution) => (
                    <li
                      key={`${contribution.exerciseId}-${contribution.role}`}
                      className={cn('flex items-baseline justify-between gap-3 text-xs')}
                    >
                      <span className="text-ink-300 min-w-0 truncate">{contribution.name}</span>
                      <span className="numeric text-ink-500 shrink-0">
                        {contribution.counted} {contribution.counted === 1 ? 'set' : 'sets'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
