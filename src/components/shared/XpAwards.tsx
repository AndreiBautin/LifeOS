import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { XpAwardContext, type XpAward } from '@/app/xp-award'
import { actById } from '@/domain/game/registry'

/**
 * The provider and the overlay for act acknowledgements.
 *
 * The lifecycle is a timer, not a CSS animation, and that is deliberate.
 * The app's reduced-motion block collapses every animation to 0.01ms
 * with `!important`, so a toast that removed itself on `animationend`
 * would flash and vanish for exactly the people who asked for less
 * movement. Here the timer decides *when* it goes and the animation only
 * decides *how* — with reduced motion it appears, sits still for its two
 * seconds, and leaves.
 */

const VISIBLE_MS = 2000

export function XpAwardProvider({ children }: { readonly children: ReactNode }) {
  const [awards, setAwards] = useState<readonly XpAward[]>([])
  const next = useRef(0)

  const award = useCallback((actId: string) => {
    const act = actById(actId)

    // An act this build does not know about says nothing rather than
    // guessing a value. Silence is the honest failure here.
    if (act === undefined) return

    const id = next.current
    next.current += 1

    setAwards((current) => [...current, { id, points: act.points, label: act.label }])

    setTimeout(() => {
      setAwards((current) => current.filter((one) => one.id !== id))
    }, VISIBLE_MS)
  }, [])

  const value = useMemo(() => ({ awards, award }), [awards, award])

  return (
    <XpAwardContext value={value}>
      {children}
      <XpAwardOverlay awards={awards} />
    </XpAwardContext>
  )
}

function XpAwardOverlay({ awards }: { readonly awards: readonly XpAward[] }) {
  if (awards.length === 0) return null

  return (
    <div
      /*
       * Above the navigation and out of the way of the thumb. `polite`
       * rather than `assertive`: this is a confirmation, and interrupting
       * a screen reader mid-sentence to say "+15 XP" would be worse than
       * the silence it replaces.
       */
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-1.5"
      style={{ bottom: 'calc(5.5rem + var(--safe-bottom))' }}
      aria-live="polite"
    >
      {awards.map((one) => (
        <div
          key={one.id}
          className="xp-award border-accent-500/40 text-ink-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold"
          style={{
            backgroundColor: 'color-mix(in oklab, var(--surface-raised) 88%, transparent)',
            boxShadow: '0 0 18px -6px var(--color-accent-500)',
          }}
        >
          <span className="text-accent-400 numeric">+{one.points} XP</span>
          <span className="text-ink-500 text-xs font-normal">{one.label}</span>
        </div>
      ))}
    </div>
  )
}
