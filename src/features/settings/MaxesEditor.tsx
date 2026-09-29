import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import type { AppSettings } from '@/domain/settings/settings'
import type { WeightUnit } from '@/domain/units/weight'
import { Card, Section } from '@/components/shared/primitives'

/**
 * Where a strength lift starts before it has any history.
 *
 * A first session opens at 85% of this figure; after that the bar is
 * carried forward from what was actually lifted, so an estimate that is
 * a little off costs one session's recalibration and nothing more.
 *
 * Three lifts, because three are trained. The overhead press and a
 * reader for an old 5/3/1 export both lived here and went with the
 * frameworks that needed them.
 */

const LIFTS: readonly { readonly id: ExerciseId; readonly label: string }[] = [
  { id: asExerciseId(STRENGTH_LIFT_SLUGS.squat), label: 'Squat' },
  { id: asExerciseId(STRENGTH_LIFT_SLUGS.bench), label: 'Bench press' },
  { id: asExerciseId(STRENGTH_LIFT_SLUGS.deadlift), label: 'Deadlift' },
]

interface Props {
  readonly settings: AppSettings
  readonly onChange: (estimatedMaxes: AppSettings['estimatedMaxes']) => void
}

export function MaxesEditor({ settings, onChange }: Props) {
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
