import { HeartPulse, Minus, Plus } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { Link } from 'react-router-dom'

import { Badge, Button, Card } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import { buttonStyles } from '@/components/shared/styles'
import type { PhaseView, PoolView } from '@/application/use-cases/vitals/vitals'
import { PHASE_LABELS, PHASE_VERDICT_LABELS } from '@/domain/vitals/weight'
import { cycleOf, directionOf, type Vice } from '@/domain/vitals/charges'
import { cn } from '@/lib/cn'
import type { MacroTargets } from '@/domain/vitals/macros'

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

/**
 * What the countdown is counting towards, in the pool's own terms.
 *
 * A rolling pool gets back one charge and a calendar pool gets back all
 * of them, so "+1 in 9h" is true of the first and a lie about the
 * second. Saying "resets" instead is not a wording preference — under a
 * weekly allowance with three spent, "+1" would have somebody expecting
 * one drink on Monday when they have four.
 */
function whenBack(vice: Vice, at: Date, now: Date): string {
  const cycle = cycleOf(vice)

  if (cycle.kind === 'rolling') return `+1 in ${backIn(at, now)}`

  /*
   * A day away or less reads better as a duration; further out, the day
   * itself is what a person is actually asking about — "Monday" answers
   * "when can I have another" and "in 3d 4h" makes them count.
   */
  const hoursAway = (at.getTime() - now.getTime()) / (60 * 60 * 1000)

  return hoursAway <= 24
    ? `resets in ${backIn(at, now)}`
    : `resets ${at.toLocaleDateString(undefined, { weekday: 'long' })}`
}

function backIn(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((at.getTime() - now.getTime()) / 60000))
  if (minutes < 60) return `${String(minutes)}m`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(rest)}m`
}

/**
 * A pool measured in units rather than counted.
 *
 * Pips cannot show four hundred milligrams, so this gets a bar and the
 * numbers written out. The presets are the point: logging caffeine by
 * typing 95 every morning is a form, and a form is a thing you stop
 * filling in.
 */
function MeasuredPool({ pool, now }: { readonly pool: PoolView; readonly now: Date }) {
  const spend = useSpendVice()
  const undo = useUndoVice()
  const { vice, reading } = pool

  const isTarget = directionOf(vice) === 'target'
  const used = reading.onCooldown

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-50 truncate text-sm">{vice.name}</span>
        <span className="text-ink-500 numeric shrink-0 text-xs">
          {used} / {vice.capacity} {vice.unit}
          {reading.over > 0 && <span className="text-bad-500"> · {reading.over} over</span>}
        </span>
      </div>

      <Meter
        className="mt-1.5"
        value={used}
        of={vice.capacity}
        height={6}
        /*
         * Green while a target is being filled and while a limit still
         * has room; amber once a limit is spent. A full water bar is
         * good news and a full caffeine bar is not, and the colour is
         * the fastest way to say which without reading.
         */
        tone={isTarget ? 'good' : reading.available > 0 ? 'accent' : 'warn'}
        label={`${vice.name}: ${String(used)} of ${String(vice.capacity)} ${vice.unit ?? ''}`}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {(vice.presets ?? []).map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            disabled={spend.isPending}
            onClick={() => {
              spend.mutate({ id: vice.id, amount: preset.amount })
            }}
          >
            {preset.label}
          </Button>
        ))}

        <Button
          variant="ghost"
          size="sm"
          aria-label={`Undo the last ${vice.name}`}
          disabled={vice.spent.length === 0 || undo.isPending}
          onClick={() => {
            undo.mutate(vice.id)
          }}
        >
          <Minus size={14} aria-hidden />
        </Button>

        {reading.nextBackAt !== undefined && (
          <span className="text-ink-700 numeric ml-auto text-xs">
            {whenBack(vice, reading.nextBackAt, now)}
          </span>
        )}
      </div>
    </div>
  )
}

function PoolRow({ pool, now }: { readonly pool: PoolView; readonly now: Date }) {
  const spend = useSpendVice()
  const undo = useUndoVice()
  const { vice, reading } = pool

  // A pool with a unit is a quantity, and a row of pips cannot show one.
  if (vice.unit !== undefined) return <MeasuredPool pool={pool} now={now} />

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-ink-50 truncate text-sm">{vice.name}</p>
        <p className="text-ink-700 numeric text-xs">
          {reading.over > 0
            ? `${String(reading.over)} over`
            : `${String(reading.available)} of ${String(reading.capacity)}`}
          {reading.nextBackAt !== undefined && ` · ${whenBack(vice, reading.nextBackAt, now)}`}
        </p>
        {/*
          The second limit, said only when it is the one that binds. On a
          day already started it is not news; on a fresh day with the
          days gone it is the entire answer to "can I have one".
        */}
        {reading.days !== undefined && (
          <p
            className={cn(
              'numeric text-xs',
              !reading.days.todayCounts && reading.days.used >= reading.days.allowed
                ? 'text-warn-500'
                : 'text-ink-700',
            )}
          >
            {reading.days.used} of {reading.days.allowed} days used
            {!reading.days.todayCounts &&
              reading.days.used >= reading.days.allowed &&
              ' · not today'}
          </p>
        )}
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
          spend.mutate({ id: vice.id })
        }}
      >
        <Plus size={14} aria-hidden />
      </Button>
    </div>
  )
}

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
