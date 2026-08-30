import { HeartPulse } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { Link } from 'react-router-dom'

import { Badge, Card } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import { buttonStyles } from '@/components/shared/styles'
import type { PhaseView } from '@/application/use-cases/vitals/vitals'
import { PHASE_LABELS, PHASE_VERDICT_LABELS } from '@/domain/vitals/weight'
import { directionOf } from '@/domain/vitals/charges'
import type { MacroTargets } from '@/domain/vitals/macros'

import { useServices } from '@/app/context'

import { PoolRow } from './PoolRow'
import { useVitalsToday } from './hooks'

/**
 * Vitals on Today: what you have left, and how the day feels.
 *
 * **Two bars, never one.** The charges are a count of things that
 * happened and the condition is how you said you felt, and averaging
 * them would let the half you can simply decide move the half that is a
 * record. A single "HP" number would also be precisely the invented
 * scale `domain/game/` refuses everywhere else — so they sit side by
 * side and are labelled as the different kinds of thing they are.
 *
 * It lives on Today because Today is present tense and this is the most
 * present-tense thing in the app. It is not a ninth tab because a ninth
 * tab does not fit: every nav cell clears 44px, so nine of them need 396
 * and a 375-pixel phone has 375.
 */

function PhaseLine({
  phase,
  macros,
}: {
  readonly phase: PhaseView
  readonly macros?: MacroTargets | undefined
}) {
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

      {/*
        One line, and only when there is something to say. The full macro
        breakdown lives on the Vitals screen — what belongs on Today is
        the correction, because that is the part that changes what you do
        at the next meal.
      */}
      {macros?.adjustment !== undefined && macros.adjustment !== 0 && (
        <p className="text-ink-500 numeric mt-1 text-sm">
          about {Math.abs(macros.adjustment)} {macros.adjustment < 0 ? 'fewer' : 'more'} a day
          {macros.calories !== undefined && ` · ${String(macros.calories)} kcal`}
        </p>
      )}
    </div>
  )
}

export function VitalsCard() {
  const vitals = useVitalsToday()
  // The injected clock, not the system one. Every countdown on this card
  // is derived from it, so a test can hold time still.
  const now = useServices().clock.now()

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

  const { pools, condition, phase } = vitals.data
  const nothingSetUp = pools.length === 0 && condition === undefined && phase.trend === undefined

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

      {/*
        The condition bar is the only continuous one here, and it is
        labelled as self-reported on the screen rather than only in the
        code. It is absent rather than at the midpoint when nothing has
        been recorded — a half-full bar would be a claim that the day is
        unremarkable, which is not the same as not having been asked.
      */}
      {condition !== undefined && (
        <div className="mb-3">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <span className="text-ink-700 text-xs tracking-wide uppercase">Condition</span>
            <span className="text-ink-700 text-xs">as you reported it</span>
          </div>
          <Meter
            value={condition.fraction}
            of={1}
            tone="good"
            label="How you rated today, across five factors"
          />
        </div>
      )}

      {/*
        Split the way the Vitals screen splits them, and for the reason
        the dailies are grouped: two things read for different questions
        should not share a list. "What is left" and "how far to go" are
        opposite readings of the same bar, and interleaving them makes
        every row need its label read before its number means anything.
      */}
      {[
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
        ))}

      {nothingSetUp ? (
        <p className="text-ink-500 text-sm">
          Charges for what you mean to limit, a weight trend for the phase you are in, and how the
          day feels.
        </p>
      ) : (
        <PhaseLine phase={phase} macros={vitals.data.macros} />
      )}
    </Card>
  )
}
