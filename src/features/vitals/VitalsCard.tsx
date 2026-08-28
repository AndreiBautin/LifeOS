import { HeartPulse, Minus, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Button, Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import type { PhaseView, PoolView } from '@/application/use-cases/vitals/vitals'
import { PHASE_LABELS, PHASE_VERDICT_LABELS } from '@/domain/vitals/weight'
import { cn } from '@/lib/cn'

import { useServices } from '@/app/context'

import { useSpendVice, useUndoVice, useVitalsToday } from './hooks'

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

function Pips({ reading }: { readonly reading: PoolView['reading'] }) {
  /*
   * Pips rather than a continuous bar, because the quantity is discrete.
   * A half-full bar invites the question of whether that is one and a
   * half coffees; three dots of which one is lit cannot be misread.
   */
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      {Array.from({ length: reading.capacity }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-2 w-2 rounded-full',
            index < reading.available ? 'bg-accent-500' : 'bg-ink-700',
          )}
        />
      ))}
      {/* Anything past the allowance gets its own mark rather than being
          clamped away — an overrun is the thing worth seeing. */}
      {Array.from({ length: reading.over }, (_, index) => (
        <span key={`over-${String(index)}`} className="bg-bad-500 h-2 w-2 rounded-full" />
      ))}
    </span>
  )
}

function backIn(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60000))
  if (minutes < 60) return `${String(minutes)}m`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`
}

function PoolRow({ pool, now }: { readonly pool: PoolView; readonly now: Date }) {
  const spend = useSpendVice()
  const undo = useUndoVice()
  const { vice, reading } = pool

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-ink-50 truncate text-sm">{vice.name}</p>
        <p className="text-ink-700 numeric text-xs">
          {reading.over > 0
            ? `${String(reading.over)} over`
            : `${String(reading.available)} of ${String(reading.capacity)}`}
          {reading.nextBackAt !== undefined && ` · +1 in ${backIn(reading.nextBackAt, now)}`}
        </p>
      </div>

      <Pips reading={reading} />

      {/*
        Undo sits beside spend rather than behind a menu, because the
        failure it fixes is a mis-tap on the button next to it.
      */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Undo the last ${vice.name}`}
        disabled={pool.vice.spent.length === 0 || undo.isPending}
        onClick={() => {
          undo.mutate(vice.id)
        }}
      >
        <Minus size={14} aria-hidden />
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Spend a ${vice.name}`}
        disabled={spend.isPending}
        onClick={() => {
          spend.mutate(vice.id)
        }}
      >
        <Plus size={14} aria-hidden />
      </Button>
    </div>
  )
}

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

export function VitalsCard() {
  const vitals = useVitalsToday()
  // The injected clock, not the system one. Every countdown on this card
  // is derived from it, so a test can hold time still.
  const now = useServices().clock.now()

  if (vitals.data === undefined) return null

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
          <div className="bg-ink-800 h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-good-500 h-full rounded-full"
              style={{ width: `${String(Math.round(condition.fraction * 100))}%` }}
            />
          </div>
        </div>
      )}

      {pools.length > 0 && (
        <div className="divide-ink-800 divide-y">
          {pools.map((pool) => (
            <PoolRow key={pool.vice.id} pool={pool} now={now} />
          ))}
        </div>
      )}

      {nothingSetUp ? (
        <p className="text-ink-500 text-sm">
          Charges for what you mean to limit, a weight trend for the phase you are in, and how the
          day feels.
        </p>
      ) : (
        <PhaseLine phase={phase} />
      )}
    </Card>
  )
}
