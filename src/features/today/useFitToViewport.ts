import { useEffect, useRef, useState } from 'react'

/**
 * Scales a block of content down, never up, so it fits a landscape
 * monitor's viewport with no scrollbar at all — page or panel.
 *
 * **The third answer on this page, and the first two are worth knowing
 * before touching this one.** A height cap with `overflow-y-auto` on
 * each column technically stopped the *page* from scrolling and was
 * rightly rejected — *"adding a scroll to the sections was not what I
 * had in mind."* Tightening spacing afterwards worked, but only by
 * coincidence: it fit *this* database's amount of content on *that*
 * monitor, and the next arc or challenge added would have silently
 * broken it again. Scaling is the only one of the three that holds for
 * content of any size — nothing is clipped, nothing gets its own
 * scrollbar, the whole block just gets smaller.
 *
 * **Only on a wide, landscape screen.** Asked for directly: *"my side
 * vertical monitor and phone of course scroll is fine but a large
 * monitor like my main one it should just fill the screen without any
 * scrollbars."* `min-width: 1024px` alone cannot tell those apart — a
 * rotated monitor is easily 1024px wide. `orientation: landscape` is
 * width-versus-height of the viewport the browser actually has, which
 * is the one signal that survives a rotated monitor: it reads portrait
 * there and landscape on an ordinary wide screen, regardless of the
 * raw pixel width either one reports.
 *
 * **Measured, not guessed — including where the page previously guessed
 * wrong.** The height-cap attempt computed "space available" as a CSS
 * `calc()` copied from the shell's own padding values; this reads
 * `getBoundingClientRect().top` off the real element instead, so it
 * cannot drift the moment any padding between here and the page top
 * changes. `scrollHeight` is the content's natural, *unscaled* height —
 * a CSS `transform` never changes what `scrollHeight`/`offsetHeight`
 * report, only how the box paints, so there is no reset-then-remeasure
 * step needed before reading it.
 *
 * **Three signals recompute it, not one.** `HomePage`'s content mounts
 * short and grows as its several queries resolve — the quests, the
 * season, the character sheet each arrive on their own — so a measurement
 * taken once at mount is stale within the same second. `ResizeObserver`
 * on `contentRef` is the obvious answer and was, on its own, observed to
 * miss exactly that growth: this file already has one documented case of
 * `ResizeObserver` silently not firing on a real page (`tree-layout.ts`),
 * and the fix there was the same one applied here — never trust a single
 * signal for something this visible. A `MutationObserver` on the same
 * node, watching for children being added anywhere in the subtree, is a
 * second and more direct signal for the exact event that changes the
 * height: a card mounting. `window`'s own `resize` covers the monitor or
 * browser window changing size, which neither of the other two would
 * ever see.
 *
 * **Every one of those signals is debounced, and shipping without that
 * was the second real bug.** Reported directly: *"this looked solid full
 * screen, but then when I shrank the screen on my main monitor it looked
 * like this"* — a screenshot of the whole block rendered tiny in the
 * top-left corner of a mostly empty page. A window drag fires `resize`
 * dozens of times before it settles, and `column-width` reflows the
 * masonry at every one of those intermediate widths — so a measurement
 * taken mid-drag reads a `natural` height that belongs to a size the
 * window is only passing through, computes a scale for *that*, and then
 * nothing ever measures again once the drag stops, because the drag's
 * own last `resize` event already consumed the one measurement this hook
 * took. `scheduleMeasure` waits `SETTLE_MS` after the *last* signal
 * before it actually reads anything, so a drag's rapid-fire events
 * collapse into exactly one measurement of the size the window actually
 * ends up at.
 *
 * **The scaled block can leave a strip of unused width, and that is a
 * deliberate trade rather than an oversight.** Scaling only the height
 * axis would flatten circles into ellipses and text into a squashed
 * version of itself; scaling evenly is the only way to shrink a block
 * without distorting it, and evenly means the width shrinks by the same
 * fraction the height does. `HomePage` centers the scaled block
 * horizontally so that strip splits evenly left and right rather than
 * sitting only on one side — the same "zoomed out, not cropped" reading
 * a fit-to-window slide gives.
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
 * How long a burst of resize/mutation signals must go quiet before any
 * of them is actually read. Long enough to swallow a window drag's
 * rapid-fire `resize` events and a page's data queries settling in
 * quick succession; short enough that it never reads as a delay to a
 * person watching the screen.
 */
const SETTLE_MS = 150

export function useFitToViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ readonly scale: number; readonly height: number } | null>(null)

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
    const measure = () => {
      if (!active) {
        setFit(null)
        return
      }

      const content = contentRef.current
      const container = containerRef.current
      if (content === null || container === null) return

      const top = container.getBoundingClientRect().top
      const available = window.innerHeight - top - BOTTOM_MARGIN
      const natural = content.scrollHeight

      if (natural <= 0 || natural <= available) {
        setFit(null)
        return
      }

      setFit({ scale: available / natural, height: available })
    }

    let settle: ReturnType<typeof setTimeout> | undefined
    const scheduleMeasure = () => {
      if (settle !== undefined) clearTimeout(settle)
      settle = setTimeout(measure, SETTLE_MS)
    }

    measure()
    window.addEventListener('resize', scheduleMeasure)

    const content = contentRef.current
    const resizeObserver =
      content !== null && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(scheduleMeasure)
        : undefined
    const mutationObserver =
      content !== null && typeof MutationObserver !== 'undefined'
        ? new MutationObserver(scheduleMeasure)
        : undefined
    if (content !== null) {
      resizeObserver?.observe(content)
      mutationObserver?.observe(content, { childList: true, subtree: true })
    }

    return () => {
      if (settle !== undefined) clearTimeout(settle)
      window.removeEventListener('resize', scheduleMeasure)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
    }
  }, [active])

  return { containerRef, contentRef, fit }
}
