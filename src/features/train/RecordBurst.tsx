import { useEffect, useState } from 'react'

import { useServices } from '@/app/context'

/** How recently a set must have been logged for its record to be celebrated. */
const FRESH_MS = 3_000
const SPARKS = 12

/**
 * **A record set bursts once, the moment it is logged** — a ring of gold
 * sparks from the chip and a short buzz where the platform allows. The
 * chip already pops and shines; this is the one moment in a session
 * worth more than that, and it happens at most a few times a month.
 *
 * Only for a set logged in the last three seconds — the row turns on the
 * tap (`useLogSet`), so that is ample — and so opening a finished
 * session or paging back to an exercise does not set it off again. The
 * sparks are decoration (`aria-hidden`); the chip beside them carries the
 * words. Reduced motion collapses the animation with every other one.
 */
export function RecordBurst({ completedAt }: { readonly completedAt: string | undefined }) {
  const { clock } = useServices()
  // Decided once, when the chip first appears: it mounts with the record.
  const [live, setLive] = useState(
    () => completedAt !== undefined && clock.now().getTime() - Date.parse(completedAt) <= FRESH_MS,
  )

  useEffect(() => {
    if (!live) return
    if ('vibrate' in navigator) navigator.vibrate([30, 40, 70])
    const handle = window.setTimeout(() => {
      setLive(false)
    }, 1200)
    return () => {
      window.clearTimeout(handle)
    }
  }, [live])

  if (!live) return null
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: SPARKS }, (_, index) => (
        <span
          key={index}
          className="record-spark"
          style={{ '--spark-angle': `${String((360 / SPARKS) * index)}deg` } as React.CSSProperties}
        />
      ))}
    </span>
  )
}
