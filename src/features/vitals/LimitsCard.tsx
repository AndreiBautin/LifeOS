import { Gauge } from 'lucide-react'
import { Skeleton } from '@/components/shared/Skeleton'
import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import { Fold } from '@/components/shared/Fold'
import { counted } from '@/lib/counted'
import { buttonStyles } from '@/components/shared/styles'
import { directionOf } from '@/domain/vitals/charges'

import { useServices } from '@/app/context'

import { PoolRow } from './PoolRow'
import { useVitalsToday } from './hooks'

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

  /*
   * **A pool shut for today folds away, and is not dropped.** Reported:
   * *"alcohol only applies on certain days, but it's still cluttering
   * up the screen on days where I don't have charges available."* Right
   * — a card headed *what you have left today* was giving a full band to
   * a pool whose own caption said "not today", complete with a plus and
   * an undo, on a screen that is scanned rather than read.
   *
   * **Folded rather than filtered, because spending is never refused.**
   * That rule is load-bearing: an app that refused would be asking to be
   * lied to, and a log you lie to is worth nothing. Hiding the row
   * outright would make a Tuesday drink unloggable, which is the same
   * mistake with a tidier screen — so it goes behind a lid, one tap
   * away, exactly like the day's done and not-due habits above it.
   *
   * The Limits screen itself is untouched: that is where pools are
   * managed, and a list you manage has to show everything in it.
   */
  const shut = (pool: (typeof vitals.data.pools)[number]): boolean =>
    pool.reading.days !== undefined && !pool.reading.days.openToday

  const { pools } = vitals.data
  const today = pools.filter((pool) => !shut(pool))
  const notToday = pools.filter(shut)

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-ink-500 flex items-center gap-2 text-sm">
          <Gauge size={16} aria-hidden />
          Buffs
        </span>
        <Link to="/limits" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          {pools.length === 0 ? 'Set up' : 'Open'}
        </Link>
      </div>

      {pools.length === 0 ? (
        <p className="text-ink-500 text-sm">
          Charges that come back on their own, and what puts your health back.
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
        <>
          {[
            { of: 'limit' as const, label: 'Potions' },
            { of: 'target' as const, label: 'Restoratives' },
          ]
            .map((group) => ({
              ...group,
              rows: today.filter((pool) => directionOf(pool.vice) === group.of),
            }))
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <div key={group.of} className="mb-3 last:mb-0">
                {/* Only worth a heading when both are present — one group
                    alone is not ambiguous about which it is. */}
                {today.some((pool) => directionOf(pool.vice) !== group.of) && (
                  <p className="text-ink-700 mb-1 text-xs tracking-wide uppercase">{group.label}</p>
                )}
                <div className="divide-ink-800 divide-y">
                  {group.rows.map((pool) => (
                    <PoolRow key={pool.vice.id} pool={pool} now={now} />
                  ))}
                </div>
              </div>
            ))}

          {/*
            Nothing at all for today is a real state and worth a sentence
            rather than an empty card above a lid — the pools exist, they
            are simply not on today.
          */}
          {today.length === 0 && <p className="text-ink-500 text-sm">Nothing on for today.</p>}

          {/*
            Flat inside the lid, with no Limits/Targets headings: a fold
            is already a lid, and a second axis of headings inside one is
            structure nobody asked to see — the call the day's folds
            already make.
          */}
          {notToday.length > 0 && (
            <Fold summary={`${counted(notToday.length, 'buff', 'buffs')} not for today`}>
              <div className="divide-ink-800 divide-y">
                {notToday.map((pool) => (
                  <PoolRow key={pool.vice.id} pool={pool} now={now} />
                ))}
              </div>
            </Fold>
          )}
        </>
      )}
    </Card>
  )
}
