import { Check } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '@/app/context'
import type { Exercise } from '@/domain/exercises/exercise'
import { platesToHand, type BarKind } from '@/domain/units/plates'
import { warmupRamp } from '@/domain/units/ramp'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { cn } from '@/lib/cn'

import { PlateLoader } from './PlateLoader'

/**
 * The bar for this exercise: the plate loader, and for the main lift a
 * warm-up ramp above it.
 *
 * **Tapping a ramp step loads that step on the picture.** The ramp is a
 * list of loads, and a list of loads is the arithmetic the plate loader
 * exists to take away — so each step can be shown as plates the same
 * way, and the working load is one more chip at the end. Only the main
 * lift gets a ramp: an accessory at a light working load is its own
 * warm-up, and five chips above a curl would be furniture.
 */
export function BarSection({
  equipment,
  load,
  units,
  ramp,
}: {
  readonly equipment: Exercise['equipment'] | undefined
  readonly load: number | undefined
  readonly units: WeightUnit
  readonly ramp: boolean
}) {
  const { settings } = useSettings()
  const [step, setStep] = useState<number | undefined>(undefined)
  /** Ramp steps ticked off, by index; ephemeral, like the step on view. */
  const [done, setDone] = useState<ReadonlySet<number>>(new Set())

  const kind: BarKind | undefined =
    equipment === 'barbell' ? 'barbell' : equipment === 'ez-bar' ? 'ez-bar' : undefined
  if (kind === undefined || load === undefined) return null

  const plates = platesToHand(settings.plates, units)
  const steps = ramp ? warmupRamp(load, units, kind, plates) : []
  const shown = step === undefined ? load : (steps[step]?.load ?? load)

  /*
   * **The ramp ticks off as it is done.** Each step was only a picture to
   * load; now "Done" on the step in view ticks it and puts the next one
   * on the bar, and after the last the working load comes up — so the
   * plate picture walks the ramp with you instead of waiting to be told.
   */
  const finish = (index: number) => {
    const next = new Set(done).add(index)
    setDone(next)
    const after = steps.findIndex((_, at) => !next.has(at))
    setStep(after === -1 ? undefined : after)
  }

  return (
    <>
      {steps.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-ink-500 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
              Warm up to it
            </p>
            {done.size > 0 && (
              <span className="text-ink-500 numeric text-[0.7rem]">
                {done.size}/{steps.length} done
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Warm-up ramp">
            {steps.map((one, index) => (
              <Chip
                key={one.load}
                active={step === index}
                ticked={done.has(index)}
                onClick={() => {
                  setStep(step === index ? undefined : index)
                }}
                label={`${index === 0 ? 'Bar' : formatLoad(one.load, units)} × ${String(one.reps)}`}
              />
            ))}
            <Chip
              active={step === undefined}
              working
              onClick={() => {
                setStep(undefined)
              }}
              label={`Work ${formatLoad(load, units)}`}
            />
          </div>
          {step !== undefined && !done.has(step) && (
            <button
              type="button"
              onClick={() => {
                finish(step)
              }}
              className="tap-target text-accent-400 mt-2 inline-flex items-center gap-1.5 text-xs font-semibold"
            >
              <Check size={14} aria-hidden />
              Done — {step + 1 < steps.length ? 'next step' : 'on to the work'}
            </button>
          )}
        </div>
      )}
      <PlateLoader load={shown} unit={units} kind={kind} available={plates} />
    </>
  )
}

function Chip({
  label,
  active,
  ticked = false,
  working = false,
  onClick,
}: {
  readonly label: string
  readonly active: boolean
  readonly ticked?: boolean
  readonly working?: boolean
  readonly onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'tap-target numeric rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-accent-500/60 bg-accent-500/15 text-accent-400'
          : 'border-ink-800 text-ink-300 hover:border-ink-700',
        working && !active && 'text-ink-100',
        ticked && !active && 'border-good-500/30 text-good-500',
        'inline-flex items-center gap-1',
      )}
    >
      {ticked && <Check size={12} aria-label="done" />}
      {label}
    </button>
  )
}
