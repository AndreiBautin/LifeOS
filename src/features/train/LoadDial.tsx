import { useRef, useState } from 'react'

import { dialValue, stepValue } from '@/domain/units/step'
import { cn } from '@/lib/cn'

/** Pixels of drag per step of weight. */
const PX_PER_STEP = 12
/** Ticks drawn either side of the mark. */
const REACH = 18
/** A labelled tick every this many steps. */
const LABEL_EVERY = 5

/**
 * The weight as a ruler you drag, under the steppers: a notch per rounding
 * step, a label every five, a fixed mark in the middle. Drag left to go
 * up, right to go down; it snaps to the grid (`dialValue`), ticks the
 * phone once per notch where the platform allows, and answers the arrow
 * keys as a slider.
 *
 * **For the big change the steppers make slow** — 135 to 225 is eighteen
 * presses or one swipe — while the steppers stay for the five-pound
 * nudge. A drag only starts once it is clearly sideways, so the page
 * still scrolls through it.
 */
export function LoadDial({
  value,
  onChange,
  step,
  hint,
  unit,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly step: number
  readonly hint?: string | undefined
  readonly unit: string
}) {
  const parsed = Number(value === '' ? (hint ?? '0') : value)
  const current = Number.isFinite(parsed) ? parsed : 0
  const drag = useRef<{ x: number; y: number; start: number; locked: boolean } | undefined>(
    undefined,
  )
  /** Fractional px of the drag in progress, so the ruler glides between notches. */
  const [dx, setDx] = useState(0)
  /** The value the drag in progress began from; the render reads this, not the ref. */
  const [dragStart, setDragStart] = useState<number | undefined>(undefined)

  const commit = (next: number) => {
    if (next === current && value !== '') return
    if ('vibrate' in navigator) navigator.vibrate(4)
    onChange(String(next))
  }

  const start = dragStart ?? current
  const shown = start - (dx / PX_PER_STEP) * step
  const centre = Math.round(shown / step)
  const ticks = Array.from({ length: REACH * 2 + 1 }, (_, at) => centre + at - REACH)

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={`Weight in ${unit}, drag to change`}
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuetext={`${String(current)} ${unit}`}
      className="border-ink-800 bg-ink-900 focus-visible:outline-accent-500 relative mt-2 h-12 touch-pan-y overflow-hidden rounded-lg border select-none"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          event.preventDefault()
          commit(stepValue(current, 1, step))
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          event.preventDefault()
          commit(stepValue(current, -1, step))
        }
      }}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY, start: current, locked: false }
      }}
      onPointerMove={(event) => {
        const held = drag.current
        if (held === undefined) return
        const moveX = event.clientX - held.x
        if (!held.locked) {
          if (Math.abs(moveX) < 6) return
          if (Math.abs(event.clientY - held.y) > Math.abs(moveX)) {
            drag.current = undefined
            return
          }
          held.locked = true
          setDragStart(held.start)
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        setDx(moveX)
        commit(dialValue(held.start, moveX, PX_PER_STEP, step))
      }}
      onPointerUp={() => {
        drag.current = undefined
        setDx(0)
        setDragStart(undefined)
      }}
      onPointerCancel={() => {
        drag.current = undefined
        setDx(0)
        setDragStart(undefined)
      }}
    >
      <div className="absolute inset-0" aria-hidden>
        {ticks.map((tick) => {
          const offset = (tick - shown / step) * PX_PER_STEP
          const major = tick % LABEL_EVERY === 0
          return (
            <span
              key={tick}
              className="absolute bottom-0 flex flex-col items-center"
              style={{ left: `calc(50% + ${String(offset)}px)`, transform: 'translateX(-50%)' }}
            >
              {major && tick >= 0 && (
                <span className="numeric text-ink-500 mb-0.5 text-[0.6rem]">
                  {Number((tick * step).toFixed(2))}
                </span>
              )}
              <span
                className={cn(
                  'w-px rounded-full',
                  tick < 0 ? 'bg-transparent' : major ? 'bg-ink-300 h-4' : 'bg-ink-700 h-2.5',
                )}
              />
            </span>
          )
        })}
      </div>
      <span
        className="bg-accent-400 absolute top-1 bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full shadow-[0_0_8px_var(--color-accent-500)]"
        aria-hidden
      />
      <span
        className="from-ink-900 pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r to-transparent"
        aria-hidden
      />
      <span
        className="from-ink-900 pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent"
        aria-hidden
      />
    </div>
  )
}
