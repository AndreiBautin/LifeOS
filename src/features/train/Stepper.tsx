import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { stepValue } from '@/domain/units/step'
import { cn } from '@/lib/cn'

/**
 * A number with a minus and a plus either side, for chalky hands.
 *
 * Correcting a set by typing meant a keyboard covering half the screen to
 * change 315 to 320. The steppers move the weight by the rounding
 * increment and the reps by one, each a thumb-sized target, and **holding
 * one repeats** — slowly, then faster — so a bigger change is still one
 * press. The field stays a field: tap the number and type, for the jump
 * no stepper should be asked to make.
 *
 * An empty field steps from its placeholder — last time's number — so the
 * first press lands next to what was done rather than at zero.
 */
export function Stepper({
  label,
  id,
  value,
  onChange,
  step,
  min = 0,
  hint,
}: {
  readonly label: string
  readonly id: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly step: number
  readonly min?: number
  readonly hint?: string | undefined
}) {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const timers = useRef<{ wait?: number; repeat?: number }>({})
  /* Counts presses, so the number's tick replays on each and not on opening. */
  const [presses, setPresses] = useState(0)

  const bump = (direction: 1 | -1) => {
    const current = Number(latest.current === '' ? (hint ?? '0') : latest.current)
    const base = Number.isFinite(current) ? current : 0
    const tidy = String(stepValue(base, direction, step, min))
    latest.current = tidy
    onChange(tidy)
    setPresses((count) => count + 1)
  }

  const stop = () => {
    window.clearTimeout(timers.current.wait)
    window.clearInterval(timers.current.repeat)
  }
  useEffect(() => stop, [])

  const start = (direction: 1 | -1) => {
    stop()
    bump(direction)
    timers.current.wait = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => {
        bump(direction)
      }, 90)
    }, 420)
  }

  const control = (direction: 1 | -1) => (
    <button
      type="button"
      aria-label={`${direction > 0 ? 'Increase' : 'Decrease'} ${label}`}
      className="tap-target text-ink-300 hover:text-ink-50 active:bg-ink-800 flex items-center justify-center rounded-lg transition-colors select-none"
      onPointerDown={(event) => {
        event.preventDefault()
        start(direction)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          bump(direction)
        }
      }}
    >
      {direction > 0 ? <Plus size={20} aria-hidden /> : <Minus size={20} aria-hidden />}
    </button>
  )

  return (
    <div>
      <label
        htmlFor={id}
        className="text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase"
      >
        {label}
      </label>
      <div className="bg-ink-900 border-ink-800 focus-within:border-accent-500/60 grid h-14 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-stretch rounded-xl border p-1 transition-colors">
        {control(-1)}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={hint}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          className={cn(
            'numeric text-ink-50 placeholder:text-ink-700 w-full min-w-0 bg-transparent text-center text-2xl font-semibold outline-none',
            presses === 0 ? undefined : presses % 2 === 0 ? 'stepper-tick-a' : 'stepper-tick-b',
          )}
        />
        {control(1)}
      </div>
    </div>
  )
}
