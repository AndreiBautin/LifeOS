import { useEffect, useState } from 'react'

/**
 * A number that counts up to its value once, when it first appears.
 *
 * Runs on `requestAnimationFrame` with an ease-out, so the last digits
 * settle rather than snap. **Reduced motion shows the value directly** —
 * the global CSS gate cannot reach a number written by script. A hidden
 * tab does not fire animation frames, so a count read there sits at its
 * start; that is the harness, not the hook.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [value, setValue] = useState(reduced ? target : 0)

  useEffect(() => {
    if (reduced) return
    let frame = 0
    let start: number | undefined
    const tick = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(target * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [target, durationMs, reduced])

  return reduced ? target : value
}
