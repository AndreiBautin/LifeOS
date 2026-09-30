import { useEffect } from 'react'

/**
 * Tells the card under the pointer where the pointer is.
 *
 * One listener for the whole app rather than one per card: cards are
 * rendered by forty components and none of them should have to know this
 * exists. It writes `--mx`/`--my` on the nearest `.card`, and `index.css`
 * does everything else — the lit spot, the brighter stretch of border —
 * from those two numbers.
 *
 * **Only where a pointer can actually hover.** On a phone a tap is a
 * hover with nothing to end it, so the card would light up and stay lit;
 * `(hover: hover)` is the same gate the card's lift already uses.
 *
 * Coalesced to one write per frame, because `pointermove` fires far more
 * often than the screen draws and each write restyles the card.
 */
export function useCardSpotlight(): void {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return

    let frame = 0
    let pending: PointerEvent | undefined

    const apply = (): void => {
      frame = 0
      const event = pending
      if (event === undefined || !(event.target instanceof Element)) return
      const card = event.target.closest<HTMLElement>('.card')
      if (card === null) return
      const box = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${String(event.clientX - box.left)}px`)
      card.style.setProperty('--my', `${String(event.clientY - box.top)}px`)
    }

    const onMove = (event: PointerEvent): void => {
      pending = event
      if (frame === 0) frame = requestAnimationFrame(apply)
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [])
}
