import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import { parseLegacyMaxes, type LegacyMax } from '@/domain/import/legacy-531'
import type { AppSettings } from '@/domain/settings/settings'
import type { WeightUnit } from '@/domain/units/weight'
import { Button, Card, Section } from '@/components/shared/primitives'

/**
 * The maxes every suggested load is worked back from.
 *
 * Under a percentage-driven program this number *was* the prescription,
 * so getting it wrong changed what the program meant. RTS asks for reps
 * at an RPE, so it only decides where the suggestion starts: a wrong one
 * costs a warm-up set's worth of recalibration, not a mis-run cycle.
 * That is what makes an estimate an acceptable basis here.
 *
 * They can be typed, or read out of an export from the previous app —
 * which is the only thing worth taking from it. The sessions themselves
 * were run under a different framework with a different idea of a hard
 * set, so mixing them into the volume history would compare quantities
 * that are not the same quantity.
 */

const LIFTS: readonly { readonly id: ExerciseId; readonly label: string }[] = [
  { id: asExerciseId(STRENGTH_LIFT_SLUGS.squat), label: 'Squat' },
  { id: asExerciseId(STRENGTH_LIFT_SLUGS.bench), label: 'Bench press' },
  { id: asExerciseId(STRENGTH_LIFT_SLUGS.deadlift), label: 'Deadlift' },
  { id: asExerciseId('overhead-press'), label: 'Overhead press' },
]

interface Props {
  readonly settings: AppSettings
  readonly onChange: (estimatedMaxes: AppSettings['estimatedMaxes']) => void
}

export function MaxesEditor({ settings, onChange }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [found, setFound] = useState<readonly LegacyMax[] | undefined>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)

  const read = (text: string): void => {
    setError(undefined)
    try {
      const maxes = parseLegacyMaxes(JSON.parse(text), settings.e1rmFormula)
      if (maxes.length === 0) {
        setFound(undefined)
        setError('No completed sets were found in that file.')
        return
      }
      setFound(maxes)
    } catch {
      setFound(undefined)
      setError('That file is not readable JSON.')
    }
  }

  return (
    <Section
      title="Current maxes"
      description="Where a lift starts before it has any history. After the first session the bar is carried forward from what you actually lifted, so these only matter once each."
    >
      <Card className="space-y-3">
        {LIFTS.map((lift) => (
          <MaxRow
            key={lift.id}
            id={lift.id}
            label={lift.label}
            units={settings.units}
            value={settings.estimatedMaxes[lift.id]}
            onChange={(value) => {
              onChange({ ...settings.estimatedMaxes, [lift.id]: value })
            }}
          />
        ))}

        <div className="border-ink-800 border-t pt-3">
          <Button
            variant="outline"
            full
            onClick={() => {
              fileInput.current?.click()
            }}
          >
            <Upload size={16} aria-hidden />
            Read them from a 5/3/1 export
          </Button>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Choose a 5/3/1 export file"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file === undefined) return
              void file.text().then(read)
              event.target.value = ''
            }}
          />

          {error !== undefined && (
            <p className="text-bad-500 mt-2 text-xs" role="alert">
              {error}
            </p>
          )}

          {found !== undefined && (
            <div className="mt-3 space-y-2">
              <p className="text-ink-300 text-xs">
                Each is the best completed work set in the file. Nothing is written until you apply
                them.
              </p>
              <ul className="space-y-1">
                {found.map((max) => (
                  <li key={max.exerciseId} className="flex justify-between gap-3 text-xs">
                    <span className="text-ink-300 truncate">{max.exerciseId}</span>
                    <span className="numeric text-ink-500 shrink-0">
                      {max.estimatedMax} {settings.units} — from {max.fromLoad} × {max.fromReps} on{' '}
                      {max.onDate}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                variant="primary"
                full
                onClick={() => {
                  onChange({
                    ...settings.estimatedMaxes,
                    ...Object.fromEntries(
                      found.map((max) => [max.exerciseId, max.estimatedMax] as const),
                    ),
                  })
                  setFound(undefined)
                }}
              >
                Apply these
              </Button>
            </div>
          )}
        </div>
      </Card>
    </Section>
  )
}

function MaxRow({
  id,
  label,
  units,
  value,
  onChange,
}: {
  readonly id: ExerciseId
  readonly label: string
  readonly units: WeightUnit
  readonly value: number | undefined
  readonly onChange: (value: number) => void
}) {
  const inputId = `max-${id as string}`

  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={inputId} className="text-ink-300 text-sm">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          placeholder="—"
          onChange={(event) => {
            const parsed = Number(event.target.value)
            if (Number.isFinite(parsed) && parsed > 0) onChange(parsed)
          }}
          className="numeric bg-ink-850 border-ink-800 text-ink-50 tap-target w-24 rounded border px-2 py-1.5 text-right text-sm"
        />
        <span className="text-ink-500 w-6 text-xs">{units}</span>
      </div>
    </div>
  )
}
