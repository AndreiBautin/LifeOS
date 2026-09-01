import { Gauge, HeartPulse } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { Link } from 'react-router-dom'

import { Badge, Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { PhaseView } from '@/application/use-cases/vitals/vitals'
import { PHASE_LABELS, PHASE_VERDICT_LABELS } from '@/domain/vitals/weight'
import { directionOf } from '@/domain/vitals/charges'

import { useServices } from '@/app/context'

import { PoolRow } from './PoolRow'
import { useVitalsToday } from './hooks'

/**
 * Vitals on Today: where the scale is going.
 *
 * **Everything left here is measured.** This card held a self-rated
 * condition bar beside the weight trend, and the rule it illustrated —
 * that two readouts of different kinds are never averaged into one —
 * was sound while there were two. There is one now: the bar was five
 * factors on a poor/ok/good scale, which is a mood, and the session
 * adjustment it was meant to feed was never wired to a session.
 *
 * The rule it stood for has not gone anywhere. It is why the limits are
 * a separate card rather than a second bar on this one.
 *
 * It lives on Today because Today is present tense. It is not a ninth
 * tab because a ninth tab does not fit: every nav cell clears 44px, so
 * nine of them need 396 and a 375-pixel phone has 375.
 */

function PhaseLine({ phase }: { readonly phase: PhaseView }) {
  const rate = phase.trend?.ratePerWeek

  return (
    <div className="border-ink-800 mt-3 border-t pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-700 text-xs tracking-wide uppercase">
          {PHASE_LABELS[phase.phase]}
        </span>
        <Badge
          tone={
            phase.verdict === 'on-track' ? 'good' : phase.verdict === 'unknown' ? 'neutral' : 'warn'
          }
        >
          {PHASE_VERDICT_LABELS[phase.verdict]}
        </Badge>
      </div>

      <p className="text-ink-300 numeric mt-1 text-sm">
        {phase.trend === undefined ? (
          <span className="text-ink-500">No weigh-ins yet</span>
        ) : (
          <>
            {phase.trend.current.toFixed(1)}
            {rate !== undefined && (
              <span className="text-ink-500">
                {' · '}
                {rate > 0 ? '+' : ''}
                {rate.toFixed(2)}%/wk
                <span className="text-ink-700">
                  {' '}
                  (target {phase.range.min} to {phase.range.max})
                </span>
              </span>
            )}
          </>
        )}
      </p>
    </div>
  )
}

/**
 * The pools, on Today, in a card of their own.
 *
 * They were the top half of the Vitals card, under a heart icon, beside
 * a weight trend — and a pool is not a reading taken of the body. It is
 * a rule you set and then spend against. Splitting them gives each card
 * a heading that covers what is under it and a link that goes to the
 * screen that manages it, which one card holding both could not do.
 */
export function LimitsCard() {
  const vitals = useVitalsToday()
  const now = useServices().clock.now()

  if (vitals.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-20" label="Loading your limits" />
        <Skeleton className="mt-3 h-6 w-full" />
        <Skeleton className="mt-2 h-6 w-full" />
      </Card>
    )
  }

  const { pools } = vitals.data

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-ink-500 flex items-center gap-2 text-sm">
          <Gauge size={16} aria-hidden />
          Limits
        </span>
        <Link to="/limits" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          {pools.length === 0 ? 'Set up' : 'Open'}
        </Link>
      </div>

      {pools.length === 0 ? (
        <p className="text-ink-500 text-sm">
          Charges for what you mean to keep under, and targets for what you mean to reach.
        </p>
      ) : (
        /*
          Split the way the Limits screen splits them, and for the reason
          the dailies are grouped: two things read for different
          questions should not share a list. "What is left" and "how far
          to go" are opposite readings of the same bar, and interleaving
          them makes every row need its label read before its number
          means anything.
        */
        [
          { of: 'limit' as const, label: 'Limits' },
          { of: 'target' as const, label: 'Targets' },
        ]
          .map((group) => ({
            ...group,
            rows: pools.filter((pool) => directionOf(pool.vice) === group.of),
          }))
          .filter((group) => group.rows.length > 0)
          .map((group) => (
            <div key={group.of} className="mb-3 last:mb-0">
              {/* Only worth a heading when both are present — one group
                  alone is not ambiguous about which it is. */}
              {pools.some((pool) => directionOf(pool.vice) !== group.of) && (
                <p className="text-ink-700 mb-1 text-xs tracking-wide uppercase">{group.label}</p>
              )}
              <div className="divide-ink-800 divide-y">
                {group.rows.map((pool) => (
                  <PoolRow key={pool.vice.id} pool={pool} now={now} />
                ))}
              </div>
            </div>
          ))
      )}
    </Card>
  )
}

export function VitalsCard() {
  const vitals = useVitalsToday()

  /*
   * The card's own shape while it loads, rather than nothing. This one
   * sits above the dailies, so rendering nothing meant the first
   * checkbox started under the thumb and then jumped down the screen
   * once the pools arrived.
   */
  if (vitals.data === undefined) {
    return (
      <Card>
        <Skeleton className="h-4 w-20" label="Loading your vitals" />
        <Skeleton className="mt-3 h-2 w-full" />
        <Skeleton className="mt-3 h-6 w-full" />
        <Skeleton className="mt-2 h-6 w-full" />
      </Card>
    )
  }

  const { phase } = vitals.data
  const nothingSetUp = phase.trend === undefined

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-ink-500 flex items-center gap-2 text-sm">
          <HeartPulse size={16} aria-hidden />
          Vitals
        </span>
        <Link to="/vitals" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          {nothingSetUp ? 'Set up' : 'Open'}
        </Link>
      </div>

      {nothingSetUp ? (
        <p className="text-ink-500 text-sm">A weight trend for the phase you are in.</p>
      ) : (
        <PhaseLine phase={phase} />
      )}
    </Card>
  )
}
