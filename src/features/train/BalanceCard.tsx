import { Scale } from 'lucide-react'

import { EVEN, describeLean, type PairBalance } from '@/domain/volume/balance'
import { Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { useMuscleBalance } from './hooks'

/**
 * Push against pull, quads against the hinge, upper against lower, over
 * the last four weeks (`muscleBalance`).
 *
 * **Its picture is a tug of war**, not another radar or ring: a track
 * with the centre marked, a knob pulled towards the heavier side by the
 * four weeks together, and a faint dot per week behind it — oldest
 * faintest — so whether the lean is growing or closing reads off the
 * trail. The band either side of centre is "even" (`EVEN`); the knob is
 * the accent inside it and amber outside.
 */
export function BalanceCard() {
  const balance = useMuscleBalance()
  if (balance.data === undefined) return null

  return (
    <Card>
      <CardHeading icon={<Scale size={16} aria-hidden />} title="Balance · 4 weeks" />
      <ul className="space-y-5">
        {balance.data.map((pair) => (
          <TugRow key={pair.pair.key} balance={pair} />
        ))}
      </ul>
    </Card>
  )
}

function TugRow({ balance }: { readonly balance: PairBalance }) {
  const { pair, total, weeks } = balance
  const at = (lean: number) => `${String(50 + lean * 50)}%`
  const even = total.lean === undefined || Math.abs(total.lean) <= EVEN

  return (
    <li>
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="text-ink-300">
          {pair.left.label} <span className="numeric text-ink-50 font-semibold">{total.left}</span>
        </span>
        <span className={cn('text-[0.7rem]', even ? 'text-ink-500' : 'text-warn-500')}>
          {describeLean(balance)}
        </span>
        <span className="text-ink-300">
          <span className="numeric text-ink-50 font-semibold">{total.right}</span>{' '}
          {pair.right.label}
        </span>
      </div>
      <div
        className="relative h-5"
        role="img"
        aria-label={`${pair.left.label} ${String(total.left)} sets, ${pair.right.label} ${String(total.right)} sets: ${describeLean(balance)}`}
      >
        {/* The track, and the even band around its centre. */}
        <span className="bg-ink-800 absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" />
        <span
          className="bg-ink-700/70 absolute top-1/2 h-1.5 -translate-y-1/2"
          style={{ left: at(-EVEN), width: `${String(EVEN * 100)}%` }}
        />
        <span className="bg-ink-500 absolute top-0 left-1/2 h-5 w-px" />
        {/* A dot per week, oldest faintest. */}
        {weeks.map((week, index) =>
          week.lean === undefined ? null : (
            <span
              key={index}
              className="bg-ink-300 absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: at(week.lean), opacity: 0.2 + (index / weeks.length) * 0.5 }}
            />
          ),
        )}
        {total.lean !== undefined && (
          <span
            className={cn(
              'absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[left] duration-700',
              even ? 'border-accent-400 bg-accent-500/30' : 'border-warn-500 bg-warn-500/30',
            )}
            style={{ left: at(total.lean) }}
          />
        )}
      </div>
    </li>
  )
}
