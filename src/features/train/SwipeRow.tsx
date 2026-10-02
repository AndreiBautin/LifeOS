import { Check, SkipForward } from 'lucide-react'
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * A set row that can be swiped: right to log it as planned, left to skip.
 *
 * **The tap still opens the editor and the check still logs**, so the
 * swipe is a faster way to two things the row already does, never the
 * only way. What is underneath is drawn as the row moves — the good
 * colour and a check to the left, a skip to the right — and it commits
 * past a third of the row's width, or springs back short of it.
 *
 * Built on pointer events with `touch-action: pan-y`, so a vertical
 * swipe scrolls the page exactly as before: the row only takes the
 * gesture once it is clearly sideways. A drag is never also a tap — the
 * click that would follow it is swallowed.
 *
 * `peek` slides the row a little way and back, once, to say it moves;
 * the caller decides when that is worth saying.
 */
const LOCK = 8
const COMMIT = 0.33

export function SwipeRow({
  children,
  onRight,
  onLeft,
  peek = false,
  onSwiped,
}: {
  readonly children: ReactNode
  /** Logs the set as planned; absent where there is nothing to log. */
  readonly onRight?: (() => void) | undefined
  readonly onLeft?: (() => void) | undefined
  readonly peek?: boolean
  /** Told once a swipe commits, so a hint can stop being shown. */
  readonly onSwiped?: () => void
}) {
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const drag = useRef<{ x: number; y: number; id: number; locked: boolean } | undefined>(undefined)
  const moved = useRef(false)
  const [width, setWidth] = useState(1)

  const enabled = onRight !== undefined || onLeft !== undefined

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!enabled || event.button !== 0) return
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, locked: false }
    moved.current = false
    setWidth(event.currentTarget.getBoundingClientRect().width || 1)
    setSettling(false)
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start?.id !== event.pointerId) return
    const x = event.clientX - start.x
    const y = event.clientY - start.y
    if (!start.locked) {
      if (Math.abs(y) > LOCK && Math.abs(y) > Math.abs(x)) {
        drag.current = undefined
        return
      }
      if (Math.abs(x) < LOCK) return
      start.locked = true
      moved.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    // Resist a direction with no action behind it.
    const allowed = (x > 0 && onRight !== undefined) || (x < 0 && onLeft !== undefined)
    setDx(allowed ? x : x * 0.15)
  }

  const up = () => {
    const start = drag.current
    drag.current = undefined
    if (start?.locked !== true) return
    setSettling(true)
    const share = dx / width
    if (share > COMMIT && onRight !== undefined) {
      setDx(width)
      window.setTimeout(() => {
        onRight()
        onSwiped?.()
        setDx(0)
      }, 160)
    } else if (share < -COMMIT && onLeft !== undefined) {
      setDx(-width)
      window.setTimeout(() => {
        onLeft()
        onSwiped?.()
        setDx(0)
      }, 160)
    } else {
      setDx(0)
    }
  }

  const progress = Math.min(1, Math.abs(dx) / (width * COMMIT))

  return (
    <div className="relative overflow-hidden rounded-xl">
      {enabled && dx !== 0 && (
        <div
          className={cn(
            'absolute inset-0 flex items-center px-5',
            dx > 0 ? 'bg-good-500/25 justify-start' : 'bg-ink-800 justify-end',
          )}
          aria-hidden
        >
          {dx > 0 ? (
            <Check
              size={22}
              className="text-good-500"
              style={{ transform: `scale(${String(0.6 + progress * 0.5)})`, opacity: progress }}
            />
          ) : (
            <SkipForward
              size={20}
              className="text-ink-300"
              style={{ transform: `scale(${String(0.6 + progress * 0.5)})`, opacity: progress }}
            />
          )}
        </div>
      )}
      <div
        className={cn('relative touch-pan-y', peek && dx === 0 && !settling && 'swipe-peek')}
        style={{
          transform: dx === 0 ? undefined : `translateX(${String(dx)}px)`,
          transition: settling ? 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(event) => {
          if (moved.current) {
            event.preventDefault()
            event.stopPropagation()
            moved.current = false
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
