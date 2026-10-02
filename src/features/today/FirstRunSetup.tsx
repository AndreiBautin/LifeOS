import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import { firstSessionLoad } from '@/domain/programs/progression'
import { roundLoad, type WeightUnit } from '@/domain/units/weight'
import { Button, NumberField } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'
import { PlateLoader } from '@/features/train/PlateLoader'

/**
 * Three questions before the first session, on the hero's own surface.
 *
 * A fresh install that turns the sample down opened on cards planned
 * from default maxes nobody had chosen — a 225 bench for somebody who
 * benches 135. The setup asks the three things the first session is
 * built from: units, bodyweight (every strength standard is a multiple
 * of it) and the three maxes. **The last step shows the first bench as
 * it will be loaded**, from the same 85% rule Start uses, so the number
 * typed is checked against a bar before it is trusted.
 *
 * Shown only on a device with nothing logged and no sample, and gone for
 * good once finished or skipped. Skipping keeps the defaults, which is
 * a fine answer: every load is a suggestion the lifter overrides by
 * loading the bar they were going to load anyway.
 */
const LIFTS = [
  { key: 'squat', label: 'Squat' },
  { key: 'bench', label: 'Bench press' },
  { key: 'deadlift', label: 'Deadlift' },
] as const

type Step = 'units' | 'bodyweight' | 'maxes'
const STEPS: readonly Step[] = ['units', 'bodyweight', 'maxes']

export function FirstRunSetup() {
  const services = useServices()
  const { settings, update } = useSettings()
  const [step, setStep] = useState<Step>('units')

  const empty = useQuery({
    queryKey: ['workouts', 'count'],
    queryFn: async () => (await services.workouts.count()) === 0,
  })

  const sample = settings.sampleData === 'loaded' || settings.sampleData === 'kept'
  if (settings.setupDone === true || sample || empty.data !== true) return null

  const finish = () => {
    update({ setupDone: true })
  }
  const at = STEPS.indexOf(step)
  const benchId = asExerciseId(STRENGTH_LIFT_SLUGS.bench)
  const benchMax = settings.estimatedMaxes[benchId]
  const firstBench =
    benchMax === undefined
      ? undefined
      : roundLoad(firstSessionLoad(benchMax), settings.roundingIncrement)

  return (
    <section className="hero-panel p-5 sm:p-6" aria-labelledby="setup-title">
      <div className="flex items-center justify-between gap-3">
        <p className="text-accent-400 flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] uppercase">
          <Sparkles size={14} aria-hidden />
          Set up · {at + 1} of {STEPS.length}
        </p>
        <button
          type="button"
          onClick={finish}
          className="tap-target text-ink-500 hover:text-ink-300 text-xs"
        >
          Skip
        </button>
      </div>

      <div className="mt-3 flex gap-1.5" aria-hidden>
        {STEPS.map((one, index) => (
          <span
            key={one}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-500',
              index <= at ? 'bg-accent-400' : 'bg-ink-800',
            )}
          />
        ))}
      </div>

      {step === 'units' && (
        <>
          <h2 id="setup-title" className="text-ink-50 mt-4 text-2xl font-semibold tracking-tight">
            Pounds or kilos?
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {(['lb', 'kg'] as const satisfies readonly WeightUnit[]).map((unit) => (
              <Button
                key={unit}
                size="lg"
                variant={settings.units === unit ? 'primary' : 'outline'}
                onClick={() => {
                  update({ units: unit, roundingIncrement: unit === 'kg' ? 2.5 : 5 })
                  setStep('bodyweight')
                }}
              >
                {unit === 'lb' ? 'Pounds' : 'Kilos'}
              </Button>
            ))}
          </div>
        </>
      )}

      {step === 'bodyweight' && (
        <>
          <h2 id="setup-title" className="text-ink-50 mt-4 text-2xl font-semibold tracking-tight">
            What do you weigh?
          </h2>
          <p className="text-ink-300 mt-1 text-sm">Every strength standard is a multiple of it.</p>
          <div className="mt-4">
            <SetupNumber
              label={`Bodyweight (${settings.units})`}
              value={settings.bodyweight}
              onCommit={(bodyweight) => {
                update({ bodyweight })
              }}
            />
          </div>
          <Next
            onClick={() => {
              setStep('maxes')
            }}
          />
        </>
      )}

      {step === 'maxes' && (
        <>
          <h2 id="setup-title" className="text-ink-50 mt-4 text-2xl font-semibold tracking-tight">
            Your best single, roughly
          </h2>
          <p className="text-ink-300 mt-1 text-sm">
            A guess is fine — after the first session the bar follows what you actually lift.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {LIFTS.map(({ key, label }) => {
              const id: ExerciseId = asExerciseId(STRENGTH_LIFT_SLUGS[key])
              return (
                <SetupNumber
                  key={key}
                  label={label}
                  compact
                  value={settings.estimatedMaxes[id]}
                  onCommit={(value) => {
                    update({ estimatedMaxes: { ...settings.estimatedMaxes, [id]: value } })
                  }}
                />
              )
            })}
          </div>
          {firstBench !== undefined && (
            <div className="mt-4">
              <p className="text-ink-300 text-sm">
                Your first bench opens at{' '}
                <span className="numeric text-ink-50 font-semibold">
                  {firstBench} {settings.units}
                </span>
                :
              </p>
              <PlateLoader load={firstBench} unit={settings.units} />
            </div>
          )}
          <Button variant="primary" size="lg" full className="mt-4" onClick={finish}>
            Done
          </Button>
        </>
      )}
    </section>
  )
}

function Next({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button variant="primary" size="lg" full className="mt-4" onClick={onClick}>
      Next
      <ArrowRight size={16} aria-hidden />
    </Button>
  )
}

/**
 * A number field that keeps its own text and saves only a valid number.
 * Written straight to settings, clearing the box to retype it was
 * ignored — an empty field is not a weight — and the old digit stayed.
 */
function SetupNumber({
  label,
  value,
  compact = false,
  onCommit,
}: {
  readonly label: string
  readonly value: number | undefined
  readonly compact?: boolean
  readonly onCommit: (value: number) => void
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value))
  return (
    <NumberField
      label={label}
      {...(compact ? { className: 'h-12 text-lg' } : {})}
      value={text}
      onChange={(event) => {
        setText(event.target.value)
        const next = Number(event.target.value)
        if (event.target.value !== '' && Number.isFinite(next) && next > 0) onCommit(next)
      }}
    />
  )
}
