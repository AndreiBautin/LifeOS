import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { asExerciseId } from '@/domain/ids/ids'
import type { LoadSource, RepTarget, SetPrescription } from '@/domain/programs/prescription'
import { SLOT_ROLES, SLOT_ROLE_LABELS, type Slot, type SlotRole } from '@/domain/programs/program'
import { Button } from '@/components/shared/primitives'

/**
 * Editing one exercise's prescription.
 *
 * The screen that has to make the load union comprehensible without
 * naming it. A lifter picks how the weight is decided — a percentage of a
 * training max, an RPE to work to, a fixed number, bodyweight, or nothing
 * — and then fills in the one field that choice needs. That is the whole
 * of what makes this builder able to express both 5/3/1 and a
 * hypertrophy block, surfaced as five radio buttons.
 */

interface Props {
  readonly slot: Slot
  readonly exercises: readonly { readonly id: string; readonly name: string }[]
  readonly onSave: (slot: Slot) => void
  readonly onCancel: () => void
}

export function SlotEditor({ slot, exercises, onSave, onCancel }: Props) {
  const [role, setRole] = useState<SlotRole>(slot.role)
  const [exerciseId, setExerciseId] = useState(
    slot.exercise.kind === 'specific' ? String(slot.exercise.exerciseId) : '',
  )
  const [sets, setSets] = useState<SetPrescription[]>([...slot.sets])
  const [rest, setRest] = useState(String(slot.restSeconds ?? ''))

  return (
    <div className="border-accent-500/40 bg-ink-850 space-y-4 rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-ink-100 text-sm font-semibold">Edit exercise</h4>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Cancel editing">
          <X size={16} aria-hidden />
        </Button>
      </div>

      <Field label="Exercise">
        <select
          value={exerciseId}
          onChange={(event) => {
            setExerciseId(event.target.value)
          }}
          className="bg-ink-900 border-ink-800 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
        >
          {exercises.map((exercise) => (
            <option key={exercise.id} value={exercise.id}>
              {exercise.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Role">
        <div className="flex flex-wrap gap-1.5">
          {SLOT_ROLES.map((candidate) => (
            <Button
              key={candidate}
              size="sm"
              variant={role === candidate ? 'primary' : 'outline'}
              onClick={() => {
                setRole(candidate)
              }}
            >
              {SLOT_ROLE_LABELS[candidate]}
            </Button>
          ))}
        </div>
      </Field>

      <Field label="Rest (seconds)">
        <input
          type="number"
          inputMode="numeric"
          value={rest}
          onChange={(event) => {
            setRest(event.target.value)
          }}
          placeholder="90"
          className="numeric bg-ink-900 border-ink-800 text-ink-50 tap-target w-full rounded-lg border px-3 text-sm"
        />
      </Field>

      <Field label="Sets">
        <ul className="space-y-2">
          {sets.map((set, index) => (
            <li key={index}>
              <SetEditor
                set={set}
                index={index}
                onChange={(updated) => {
                  setSets((current) =>
                    current.map((existing, i) => (i === index ? updated : existing)),
                  )
                }}
                onRemove={() => {
                  setSets((current) => current.filter((_, i) => i !== index))
                }}
              />
            </li>
          ))}
        </ul>

        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            setSets((current) => {
              // A new set copies the last one, because adding a sixth set
              // of ten almost never means adding a set of something else.
              const last = current[current.length - 1]
              return [
                ...current,
                last ?? {
                  load: { kind: 'rpe', target: 8 },
                  reps: { kind: 'range', low: 8, high: 12 },
                },
              ]
            })
          }}
        >
          <Plus size={14} aria-hidden />
          Add set
        </Button>
      </Field>

      <div className="flex gap-2">
        <Button
          variant="primary"
          full
          onClick={() => {
            const restSeconds = Number(rest)
            onSave({
              ...slot,
              role,
              exercise: { kind: 'specific', exerciseId: asExerciseId(exerciseId) },
              sets,
              ...(rest.trim() !== '' && Number.isFinite(restSeconds) ? { restSeconds } : {}),
            })
          }}
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

const LOAD_KINDS = [
  { kind: 'rpe', label: 'RPE' },
  { kind: 'absolute', label: 'Fixed weight' },
  { kind: 'bodyweight', label: 'Bodyweight' },
  { kind: 'open', label: 'Your call' },
] as const

const REP_KINDS = [
  { kind: 'fixed', label: 'Exact' },
  { kind: 'range', label: 'Range' },
  { kind: 'amrap', label: 'AMRAP' },
  { kind: 'time', label: 'Time' },
] as const

interface SetEditorProps {
  readonly set: SetPrescription
  readonly index: number
  readonly onChange: (set: SetPrescription) => void
  readonly onRemove: () => void
}

function SetEditor({ set, index, onChange, onRemove }: SetEditorProps) {
  return (
    <div className="bg-ink-900 border-ink-800 space-y-2 rounded-lg border p-2">
      <div className="flex items-center justify-between">
        <span className="text-ink-500 text-xs font-medium">Set {index + 1}</span>
        <div className="flex items-center gap-1">
          <label className="text-ink-500 flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={set.isWarmup === true}
              onChange={(event) => {
                onChange({ ...set, isWarmup: event.target.checked })
              }}
            />
            warm-up
          </label>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label={`Remove set ${String(index + 1)}`}
          >
            <Trash2 size={14} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <select
            value={set.load.kind}
            onChange={(event) => {
              onChange({ ...set, load: defaultLoad(event.target.value) })
            }}
            className="bg-ink-850 border-ink-800 text-ink-100 mb-1 w-full rounded border px-2 py-1 text-xs"
            aria-label="How the weight is decided"
          >
            {LOAD_KINDS.map(({ kind, label }) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
          <LoadValue
            load={set.load}
            onChange={(load) => {
              onChange({ ...set, load })
            }}
          />
        </div>

        <div>
          <select
            value={set.reps.kind}
            onChange={(event) => {
              onChange({ ...set, reps: defaultReps(event.target.value) })
            }}
            className="bg-ink-850 border-ink-800 text-ink-100 mb-1 w-full rounded border px-2 py-1 text-xs"
            aria-label="How many reps"
          >
            {REP_KINDS.map(({ kind, label }) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
          <RepsValue
            reps={set.reps}
            onChange={(reps) => {
              onChange({ ...set, reps })
            }}
          />
        </div>
      </div>
    </div>
  )
}

function LoadValue({
  load,
  onChange,
}: {
  readonly load: LoadSource
  readonly onChange: (load: LoadSource) => void
}) {
  const input = (value: number, label: string, apply: (next: number) => LoadSource) => (
    <input
      type="number"
      inputMode="decimal"
      value={value}
      aria-label={label}
      onChange={(event) => {
        onChange(apply(Number(event.target.value)))
      }}
      className="numeric bg-ink-850 border-ink-800 text-ink-50 w-full rounded border px-2 py-1.5 text-sm"
    />
  )

  switch (load.kind) {
    case 'percent-e1rm':
      return input(load.percent, 'Percentage', (percent) => ({ ...load, percent }))
    case 'rpe':
      return input(load.target, 'Target RPE', (target) => ({ kind: 'rpe', target }))
    case 'absolute':
      return input(load.load, 'Weight', (value) => ({ kind: 'absolute', load: value }))
    case 'bodyweight':
      return input(load.addedLoad ?? 0, 'Added weight', (addedLoad) => ({
        kind: 'bodyweight',
        addedLoad,
      }))
    case 'open':
      return <p className="text-ink-500 py-1.5 text-xs">Decided in the gym</p>
  }
}

function RepsValue({
  reps,
  onChange,
}: {
  readonly reps: RepTarget
  readonly onChange: (reps: RepTarget) => void
}) {
  const input = (value: number, label: string, apply: (next: number) => RepTarget) => (
    <input
      type="number"
      inputMode="numeric"
      value={value}
      aria-label={label}
      onChange={(event) => {
        onChange(apply(Number(event.target.value)))
      }}
      className="numeric bg-ink-850 border-ink-800 text-ink-50 w-full rounded border px-2 py-1.5 text-sm"
    />
  )

  switch (reps.kind) {
    case 'fixed':
      return input(reps.reps, 'Reps', (value) => ({ kind: 'fixed', reps: value }))
    case 'amrap':
      return input(reps.minimum, 'Minimum reps', (minimum) => ({ kind: 'amrap', minimum }))
    case 'time':
      return input(reps.seconds, 'Seconds', (seconds) => ({ kind: 'time', seconds }))
    case 'range':
      return (
        <div className="flex items-center gap-1">
          {input(reps.low, 'Lowest reps', (low) => ({ ...reps, low }))}
          <span className="text-ink-500 text-xs">–</span>
          {input(reps.high, 'Highest reps', (high) => ({ ...reps, high }))}
        </div>
      )
  }
}

function defaultLoad(kind: string): LoadSource {
  switch (kind) {
    case 'percent-e1rm':
      return { kind: 'percent-e1rm', percent: 70 }
    case 'rpe':
      return { kind: 'rpe', target: 8 }
    case 'absolute':
      return { kind: 'absolute', load: 100 }
    case 'bodyweight':
      return { kind: 'bodyweight' }
    default:
      return { kind: 'open' }
  }
}

function defaultReps(kind: string): RepTarget {
  switch (kind) {
    case 'fixed':
      return { kind: 'fixed', reps: 5 }
    case 'amrap':
      return { kind: 'amrap', minimum: 5 }
    case 'time':
      return { kind: 'time', seconds: 60 }
    default:
      return { kind: 'range', low: 8, high: 12 }
  }
}

function Field({
  label,
  children,
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-ink-500 mb-1.5 text-xs font-medium tracking-wide uppercase">{label}</p>
      {children}
    </div>
  )
}
