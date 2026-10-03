import { useRef } from 'react'

/** A horizontal travel this far, mostly sideways, turns the page. */
const TURN_PX = 70

/**
 * Swiping the exercise card sideways turns to the next or previous
 * exercise — the gesture a phone already teaches for paging.
 *
 * **It yields to everything that has a swipe of its own**: a set row
 * (log/skip, `data-swipe-row`), anything typed into, any button or link.
 * It reads the gesture only when it ends, so the card never moves under a
 * thumb that was scrolling; a mostly vertical drag is the page's.
 */
export function usePageSwipe(onNext: () => void, onPrevious: () => void) {
  const start = useRef<{ readonly x: number; readonly y: number } | undefined>(undefined)

  return {
    onPointerDown: (event: React.PointerEvent) => {
      const target = event.target as Element
      if (target.closest('[data-swipe-row], input, textarea, select, button, a') !== null) {
        start.current = undefined
        return
      }
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: React.PointerEvent) => {
      const from = start.current
      start.current = undefined
      if (from === undefined) return
      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < TURN_PX || Math.abs(dx) < Math.abs(dy) * 2) return
      if (dx < 0) onNext()
      else onPrevious()
    },
    onPointerCancel: () => {
      start.current = undefined
    },
  }
}
