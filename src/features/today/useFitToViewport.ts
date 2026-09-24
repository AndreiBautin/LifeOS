import { useEffect, useRef, useState } from 'react'

/**
 * Scales a block of content down, never up, so it fits a landscape
 * monitor's viewport with no scrollbar at all — page or panel.
 *
 * **The fourth answer on this page, and the first three are worth
 * knowing before touching this one.** A height cap with
 * `overflow-y-auto` on each column stopped the *page* from scrolling and
 * was rightly rejected — *"adding a scroll to the sections was not what
 * I had in mind."* Tightening spacing afterwards worked only by
 * coincidence, for whatever amount of content happened to be in the
 * database that day. Scaling this whole block is the mechanism that
 * holds for content of any size — nothing is clipped, nothing gets its
 * own scrollbar — and it is the one part of this that has been right
 * since the first attempt.
 *
 * **What kept breaking was *when* it recomputes, not the arithmetic
 * itself.** Two event-driven versions shipped and both were caught live:
 * a plain `window.resize` listener read a `natural` height mid-drag,
 * before the masonry had finished reflowing at the new width, and then
 * nothing measured again once the drag stopped. Debouncing that, plus
 * adding a `ResizeObserver` and a `MutationObserver` as backup signals,
 * still left a real, reported case — *"this looked solid full screen,
 * but then when I shrank the screen it looked like this"* — a tiny
 * scaled block sitting in a mostly empty page, meaning something that
 * should have fired did not.
 *
 * **The fix is to stop trusting any single signal to say when
 * something changed, and check every frame instead.** A
 * `requestAnimationFrame` loop reads the same two numbers — the
 * content's natural height and the space actually available below it —
 * on every frame while this is active, and only calls `setState` when
 * the computed scale or height actually differs from what is already
 * applied. This cannot miss a resize, a drag mid-motion, or a query
 * resolving and adding a card, because it never waits for any of those
 * to announce themselves — it simply looks again, sixty times a second,
 * which is cheap for two DOM reads and a subtraction. `tree-layout.ts`
 * already has one documented case of `ResizeObserver` silently not
 * firing; this is the version of that fix which cannot have a "the
 * signal didn't fire" failure mode at all, because there is no signal.
 *
 * **Only on a wide, landscape screen.** Asked for directly: *"my side
 * vertical monitor and phone of course scroll is fine but a large
 * monitor like my main one it should just fill the screen without any
 * scrollbars."* `min-width: 1024px` alone cannot tell those apart — a
 * rotated monitor is easily 1024px wide. `orientation: landscape` is
 * width-versus-height of the viewport the browser actually has, which
 * is the one signal that survives a rotated monitor.
 *
 * **The scaled block can leave a strip of unused width, and that is a
 * deliberate trade rather than an oversight.** Scaling only the height
 * axis would flatten circles into ellipses and text into a squashed
 * version of itself; scaling evenly is the only way to shrink a block
 * without distorting it. `HomePage` centers the scaled block
 * horizontally so that strip splits evenly left and right rather than
 * sitting only on one side.
 */

const LANDSCAPE_DESKTOP = '(min-width: 1024px) and (orientation: landscape)'

/**
 * What `main`'s own bottom padding (`lg:pb-6`, 24px) reserves below this
 * page's content, plus a little breathing room. Fitting to
 * `window.innerHeight - top` alone would leave the page exactly
 * `pb-6` too tall — that padding is real space main still adds after
 * this block, not space this block can paint into.
 */
const BOTTOM_MARGIN = 32

/**
 * How much a scale or a height must differ from what is already applied
 * before it is worth a re-render. Without a threshold, sub-pixel jitter
 * from rounding would `setState` on every single frame forever.
 */
const SCALE_EPSILON = 0.001
const HEIGHT_EPSILON = 0.5

interface Fit {
  readonly scale: number
  readonly height: number
}

function sameFit(a: Fit | null, b: Fit | null): boolean {
  if (a === null || b === null) return a === b
  return (
    Math.abs(a.scale - b.scale) < SCALE_EPSILON && Math.abs(a.height - b.height) < HEIGHT_EPSILON
  )
}

export function useFitToViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<Fit | null>(null)
  const fitRef = useRef<Fit | null>(null)
  useEffect(() => {
    fitRef.current = fit
  }, [fit])

  const [active, setActive] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(LANDSCAPE_DESKTOP)
    const apply = () => {
      setActive(query.matches)
    }
    apply()
    query.addEventListener('change', apply)
    return () => {
      query.removeEventListener('change', apply)
    }
  }, [])

  useEffect(() => {
    const reset = () => {
      setFit(null)
    }

    if (!active) {
      reset()
      return
    }

    let frame: number

    const tick = () => {
      const content = contentRef.current
      const container = containerRef.current

      if (content !== null && container !== null) {
        const top = container.getBoundingClientRect().top
        const available = window.innerHeight - top - BOTTOM_MARGIN
        const natural = content.scrollHeight

        const next: Fit | null =
          natural > 0 && natural > available
            ? { scale: available / natural, height: available }
            : null

        if (!sameFit(fitRef.current, next)) setFit(next)
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [active])

  return { containerRef, contentRef, fit }
}
