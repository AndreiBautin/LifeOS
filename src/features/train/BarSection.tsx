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

  const kind: BarKind | undefined =
    equipment === 'barbell' ? 'barbell' : equipment === 'ez-bar' ? 'ez-bar' : undefined
  if (kind === undefined || load === undefined) return null

  const plates = platesToHand(settings.plates, units)
  const steps = ramp ? warmupRamp(load, units, kind, plates) : []
  const shown = step === undefined ? load : (steps[step]?.load ?? load)

  return (
    <>
      {steps.length > 0 && (
        <div className="mt-4">
          <p className="text-ink-500 mb-1.5 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
            Warm up to it
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Warm-up ramp">
            {steps.map((one, index) => (
              <Chip
                key={one.load}
                active={step === index}
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
        </div>
      )}
      <PlateLoader load={shown} unit={units} kind={kind} available={plates} />
    </>
  )
}

function Chip({
  label,
  active,
  working = false,
  onClick,
}: {
  readonly label: string
  readonly active: boolean
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
      )}
    >
      {label}
    </button>
  )
}
