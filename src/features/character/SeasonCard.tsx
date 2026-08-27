import { CalendarRange } from 'lucide-react'

import type { SeasonProgress } from '@/application/use-cases/character/season-progress'
import { Card, Section } from '@/components/shared/primitives'

/**
 * The season you are in, as a battle pass rather than a verdict.
 *
 * The bar fills against **last season's XP**, which is the only anchor
 * available that the app did not invent. A hundred tiers at thresholds
 * somebody chose would be exactly the "scale the app can move" the game
 * model refuses everywhere else — and it would be the first place in this
 * app where a number meant nothing.
 *
 * A first season has nothing to beat. It says so and shows what it has
 * earned, rather than filling a bar against zero.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function monthLabel(key: string): string {
  const month = Number(key.slice(5, 7))
  return MONTH_NAMES[month - 1] ?? key
}

export function SeasonCard({ progress }: { readonly progress: SeasonProgress }) {
  const { target } = progress
  const fill = target === undefined ? 0 : Math.min(100, Math.round((progress.xp / target) * 100))
  const beaten = target !== undefined && progress.xp >= target

  // Each month's bar is drawn against the busiest month, so the three are
  // comparable to each other rather than to a total nobody can see.
  const busiest = Math.max(1, ...progress.months.map((one) => one.xp))

  return (
    <Section
      title={progress.label}
      description={
        progress.daysLeft === 0
          ? 'This season is over.'
          : `${progress.daysLeft.toString()} days left · ${Math.round(progress.elapsed * 100).toString()}% through`
      }
    >
      <Card className="space-y-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-300 text-sm">Earned this season</span>
            <span className="numeric text-ink-50 text-sm font-semibold">
              {progress.xp} XP
              {target !== undefined && (
                <span className="text-ink-500 font-normal"> / {target}</span>
              )}
            </span>
          </div>

          {target === undefined ? (
            <p className="text-ink-500 mt-2 text-xs">
              Your first season, so there is nothing to beat yet. Next season this bar fills against
              what you earn now.
            </p>
          ) : (
            <>
              <div className="bg-ink-850 mt-2 h-2 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${beaten ? 'bg-good-500' : 'bg-accent-500'}`}
                  style={{ width: `${String(fill)}%` }}
                />
              </div>
              <p className="text-ink-500 mt-2 text-xs">
                {beaten
                  ? 'Past last season already.'
                  : `${(target - progress.xp).toString()} XP to beat last season.`}{' '}
                The target is what you actually earned last season — not a curve this app made up.
              </p>
            </>
          )}
        </div>

        <div>
          <span className="text-ink-500 mb-2 block text-xs font-medium tracking-wide uppercase">
            By month
          </span>
          <div className="flex items-end gap-2">
            {progress.months.map((month) => (
              <div key={month.month} className="flex-1">
                <div
                  className="bg-accent-500/70 w-full rounded-sm"
                  style={{ height: `${String(Math.max(2, (month.xp / busiest) * 48))}px` }}
                />
                <p className="text-ink-500 numeric mt-1 text-center text-xs">
                  {monthLabel(month.month)}
                </p>
                <p className="text-ink-600 numeric text-center text-xs">{month.xp}</p>
              </div>
            ))}
          </div>
        </div>

        {progress.areas.length === 0 ? (
          <p className="text-ink-500 text-xs">
            <CalendarRange size={14} className="mr-1 inline" aria-hidden />
            Nothing earned yet this season.
          </p>
        ) : (
          <div>
            <span className="text-ink-500 mb-2 block text-xs font-medium tracking-wide uppercase">
              Where it came from
            </span>
            <ul className="space-y-1">
              {progress.areas.map((area) => (
                <li key={area.area} className="flex items-baseline justify-between gap-2">
                  <span className="text-ink-300 text-sm">{area.name}</span>
                  <span className="numeric text-ink-500 text-xs">{area.xp} XP</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </Section>
  )
}
