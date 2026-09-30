import { useEffect, useRef, useState } from 'react'

/**
 * A number that counts up to its value when it first appears.
 *
 * **Presentation only.** The value is the value from the first render —
 * this changes which digits are on screen for the next second, never what
 * a screen reader or a test reads: the `aria-label` carries the real
 * figure throughout. A later change animates from the previous value
 * rather than from nought, so logging five XP counts five, not four
 * hundred and forty.
 *
 * Reduced motion shows the value straight away. That has to be checked
 * here rather than left to the stylesheet, because the global rule only
 * reaches CSS animations and this one is a JavaScript frame loop.
 */
export function CountUp({
  value,
  format = (n) => n.toLocaleString(),
  duration = 1100,
  delay = 150,
  as = 'span',
}: {
  readonly value: number
  readonly format?: (value: number) => string
  readonly duration?: number
  readonly delay?: number
  /** `tspan` inside an SVG `<text>`, where a `<span>` is not allowed. */
  readonly as?: 'span' | 'tspan'
}) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0))
  const from = useRef(shown)

  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = value
      return
    }

    const start = from.current
    let frame = 0
    const begin = performance.now() + delay

    const tick = (now: number): void => {
      const t = Math.max(0, Math.min(1, (now - begin) / duration))
      // Ease-out: fast at first and settling, the way a total reads.
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(Math.round(start + (value - start) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [value, duration, delay])

  // Reduced motion reads the value directly rather than the animated copy.
  const display = format(prefersReducedMotion() ? value : shown)
  return as === 'tspan' ? (
    <tspan>{display}</tspan>
  ) : (
    <span aria-label={format(value)}>{display}</span>
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
