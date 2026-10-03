import { Star } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { bestsByExercise } from '@/domain/logging/bests'
import { shiftDay, toDayKey } from '@/domain/time/day'
import { formatLoad } from '@/domain/units/weight'
import { MorphText } from '@/components/shared/MorphText'
import { morphName } from '@/components/shared/morph'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/shared/primitives'
import { useExercises, useRecentWorkouts } from '@/features/train/hooks'
import { cn } from '@/lib/cn'

/**
 * A best set this week wears gold; one untouched for eight weeks reads as
 * standing still. Gold for the month was tried and lit every tile: steady
 * progress makes almost every best a recent one, and a mark on everything
 * marks nothing.
 */
const FRESH_DAYS = 7
const STALE_DAYS = 56

/**
 * Every exercise's best, on one wall (`bestsByExercise`).
 *
 * **A tile per exercise, heaviest bar first in large type**, the best
 * reliable estimate under it, and the day — so the wall answers "what is
 * my best" and "how long ago" at once. A best set in the last month is
 * edged in gold, the colour records wear everywhere else; the rest are
 * ordinary cards. The competition lifts lead, then the freshest bests,
 * because a wall is read top-left first and that is where the news is.
 */
export function RecordsPage() {
  const { settings } = useSettings()
  const today = toDayKey(useServices().clock.now())
  const workouts = useRecentWorkouts(1000)
  const exercises = useExercises()

  if (workouts.data === undefined || exercises.data === undefined) {
    return <PageHeader title="Records" subtitle="Loading…" />
  }

  const library = exercises.data
  const fresh = shiftDay(today, -FRESH_DAYS)
  const stale = shiftDay(today, -STALE_DAYS)
  const bests = bestsByExercise(workouts.data, settings.e1rmFormula)
    .map((best) => ({ best, exercise: library.find((one) => one.id === best.exerciseId) }))
    .toSorted(
      (a, b) =>
        Number(b.exercise?.isCompetition === true) - Number(a.exercise?.isCompetition === true) ||
        b.best.heaviest.date.localeCompare(a.best.heaviest.date),
    )
  const freshCount = bests.filter(({ best }) => best.heaviest.date >= fresh).length

  return (
    <div className="mx-auto max-w-4xl pb-8">
      <PageHeader
        title="Records"
        subtitle={`${String(bests.length)} exercises · ${String(freshCount)} new this week`}
      />
      {bests.length === 0 ? (
        <Card>
          <p className="text-ink-300 text-sm">Finish a session and its bests will hang here.</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {bests.map(({ best, exercise }) => {
            const isFresh = best.heaviest.date >= fresh
            const name = exercise?.name ?? best.exerciseId
            const to = `/exercise/${best.exerciseId}`
            return (
              <li key={best.exerciseId}>
                <Link
                  viewTransition
                  to={to}
                  className={cn(
                    'card flex h-full flex-col p-3.5 transition-transform hover:-translate-y-0.5',
                    isFresh && 'ring-1 ring-[oklch(0.86_0.13_85/45%)]',
                  )}
                >
                  <span className="flex items-start justify-between gap-2">
                    <MorphText
                      to={to}
                      name={morphName('exercise', best.exerciseId)}
                      className="text-ink-300 line-clamp-2 text-xs font-medium"
                    >
                      {name}
                    </MorphText>
                    {isFresh && (
                      <Star
                        size={14}
                        fill="currentColor"
                        className="shrink-0 text-[oklch(0.86_0.13_85)]"
                        aria-label="Set this week"
                      />
                    )}
                  </span>
                  <span className="numeric text-ink-50 mt-3 text-2xl leading-none font-semibold">
                    {formatLoad(best.heaviest.load, settings.units)}
                  </span>
                  <span className="numeric text-ink-300 mt-1 text-sm">× {best.heaviest.reps}</span>
                  <span className="text-ink-500 numeric mt-auto pt-3 text-[0.7rem]">
                    {best.heaviest.date < stale ? (
                      <span className="text-warn-500">
                        Since {shortDate(best.heaviest.date, today)}
                      </span>
                    ) : (
                      shortDate(best.heaviest.date, today)
                    )}
                    {best.estimate === undefined
                      ? ''
                      : ` · e1RM ${String(Math.round(best.estimate.value))}`}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function shortDate(day: string, today: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  })
}
