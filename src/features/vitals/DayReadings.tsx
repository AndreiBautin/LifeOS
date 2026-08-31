import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { serialise } from '@/lib/serialise'
import { Card, Section } from '@/components/shared/primitives'
import {
  DAY_FIGURE_LABELS,
  DAY_FIGURE_UNITS,
  DAY_FIGURES,
  isPlausible,
  type DayFigure,
} from '@/domain/vitals/day-reading'
import { daySummary, recordToday, SUMMARY_DAYS } from '@/application/use-cases/vitals/days'

/**
 * Sleep and what was eaten, typed once a day.
 *
 * The report: *"macro tracking shouldn't be prescriptive — I have Cal AI
 * for auto adjustments. I mainly want it for visibility and tracking,
 * the same way I want to track sleep, to feed into how the cut is going
 * and how the avatar is doing health-wise."*
 *
 * **This is not the food log the app has twice refused to build**, and
 * that refusal stands: a calorie log needs a database of foods and
 * portions, it falls behind first, and everything derived from a stale
 * one is quietly wrong. These are four numbers read off a screen in
 * another app that did the counting — the same shape as a weigh-in.
 *
 * **Nothing here is a target and nothing pays XP.** Typing what you
 * slept is a measurement, and the app already refuses to pay for
 * standing on a scale.
 */

const DAYS = ['vitals', 'days'] as const

export function DayReadings() {
  const services = useServices()
  const client = useQueryClient()

  const summary = useQuery({ queryKey: DAYS, queryFn: () => daySummary(services) })
  /*
   * Serialised, because each box writes to the *same* row.
   *
   * Found by driving it: sleep, calories and protein typed in sequence
   * fired three read-modify-writes, and the calories write read the day
   * before the sleep write had saved — so sleep vanished and the suite
   * stayed green. Same hazard the backlog's progress log has, arriving
   * from the other direction: there it is two taps on one control, here
   * it is one tap each on three.
   */
  const record = useMutation({
    mutationFn: (changes: Partial<Record<DayFigure, number | null>>) =>
      serialise('day-reading', () => recordToday(changes, services)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: DAYS })
    },
  })

  const [draft, setDraft] = useState<Partial<Record<DayFigure, string>>>({})

  const today = summary.data?.today
  const averages = summary.data?.averages ?? {}
  const counts = summary.data?.counts ?? {}

  return (
    <Section title="The day" description="Sleep and what you ate, from wherever you count them">
      <Card className="space-y-3">
        {DAY_FIGURES.map((figure) => {
          const stored = today?.[figure]
          const typed = draft[figure]
          const value = typed ?? (stored === undefined ? '' : String(stored))
          const parsed = value.trim() === '' ? undefined : Number(value)
          const bad = parsed !== undefined && !isPlausible(figure, parsed)

          return (
            <div key={figure} className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="text-ink-500 mb-1 block text-xs">{DAY_FIGURE_LABELS[figure]}</span>
                <div className="flex items-center gap-2">
                  <input
                    className={[
                      'bg-ink-850 text-ink-50 placeholder:text-ink-700 numeric tap-target w-full rounded-xl border px-3 text-sm',
                      bad ? 'border-bad-500' : 'border-ink-800',
                    ].join(' ')}
                    aria-invalid={bad}
                    inputMode="decimal"
                    aria-label={DAY_FIGURE_LABELS[figure]}
                    placeholder="—"
                    value={value}
                    onChange={(event) => {
                      setDraft({ ...draft, [figure]: event.target.value })
                    }}
                    onBlur={() => {
                      if (typed === undefined) return

                      /*
                       * An emptied box *clears* the figure rather than
                       * writing a zero, and those are different claims:
                       * "I did not check" against "I slept none", where
                       * only the second would corrupt an average.
                       */
                      if (value.trim() === '') {
                        record.mutate({ [figure]: null })
                        return
                      }

                      if (parsed === undefined || !isPlausible(figure, parsed)) return
                      record.mutate({ [figure]: parsed })
                    }}
                  />
                  <span className="text-ink-700 w-10 shrink-0 text-xs">
                    {DAY_FIGURE_UNITS[figure]}
                  </span>
                </div>
              </label>

              {/*
                The average sits beside the box it belongs to, and says
                how many days it is made of. "7.4 over 5 days" is
                checkable; "7.4" alone is a number you have to trust.
              */}
              <span className="text-ink-700 numeric w-24 shrink-0 pt-5 text-right text-xs">
                {averages[figure] === undefined
                  ? '—'
                  : `${String(averages[figure])} avg · ${String(counts[figure] ?? 0)}d`}
              </span>
            </div>
          )
        })}

        {DAY_FIGURES.some((figure) => {
          const typed = draft[figure]
          if (typed === undefined || typed.trim() === '') return false
          return !isPlausible(figure, Number(typed))
        }) && (
          <p role="alert" className="text-bad-500 text-xs">
            One of those is outside what a day can hold. It is refused rather than rounded into
            range — a figure nobody produced would sit in the average forever.
          </p>
        )}

        <p className="text-ink-700 text-xs">
          Averaged over the last {SUMMARY_DAYS} days, counting only the days you recorded. A day you
          did not enter is left out rather than counted as nothing.
        </p>
      </Card>
    </Section>
  )
}

export { DAYS as DAY_READING_KEY }
