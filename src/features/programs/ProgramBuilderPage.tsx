import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { createProgramFromRecipe } from '@/application/use-cases/programs/manage-programs'
import { useServices, useSettings } from '@/app/context'
import type { ProgramRecipe } from '@/domain/assembly/recipe'
import { defaultRecipe, DEFAULT_ASSISTANCE, DEFAULT_PEAKING } from '@/domain/assembly/recipe'
import { MAIN_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { MUSCLE_GROUPS, MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import {
  DEFAULT_BBB,
  SUPPLEMENTAL_LABELS,
  SUPPLEMENTAL_STYLES,
  type SupplementalStyle,
} from '@/domain/framework/five-three-one'
import { asExerciseId } from '@/domain/ids/ids'
import { BUILT_IN_SPLITS } from '@/domain/splits/split'
import { Button, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

/**
 * Composing a program.
 *
 * Three decisions, in the order they actually matter: which framework
 * sets the main work, how the week is laid out, and how much assistance
 * volume to fill in around it. Everything else has a default that a
 * lifter can leave alone — and everything the form produces lands in an
 * ordinary editable template, so nothing here is a ceiling on what can be
 * built, only a fast way to reach a sensible starting point.
 */
export function ProgramBuilderPage() {
  const services = useServices()
  const { settings } = useSettings()
  const client = useQueryClient()
  const navigate = useNavigate()

  const [name, setName] = useState('My 5/3/1')
  const [splitId, setSplitId] = useState('four-day-main')
  const [supplemental, setSupplemental] = useState<SupplementalStyle>('bbb')
  const [supplementalSets, setSupplementalSets] = useState(5)
  const [supplementalReps, setSupplementalReps] = useState(10)
  const [supplementalPercent, setSupplementalPercent] = useState(50)
  const [trainingMaxPercent, setTrainingMaxPercent] = useState(
    settings.roundingIncrement === 5 ? 90 : 90,
  )
  const [upperIncrement, setUpperIncrement] = useState(settings.units === 'kg' ? 2.5 : 5)
  const [lowerIncrement, setLowerIncrement] = useState(settings.units === 'kg' ? 5 : 10)
  const [assistance, setAssistance] = useState<'rp-landmarks' | 'none'>('rp-landmarks')
  const [maxSlots, setMaxSlots] = useState(DEFAULT_ASSISTANCE.maxSlotsPerDay)
  const [includeWarmups, setIncludeWarmups] = useState(true)
  const [peaking, setPeaking] = useState(false)
  const [cycles, setCycles] = useState<number | 'indefinite'>('indefinite')

  const split = BUILT_IN_SPLITS.find((candidate) => candidate.id === splitId)

  const create = useMutation({
    mutationFn: (recipe: ProgramRecipe) => createProgramFromRecipe(recipe, services),
    onSuccess: (program) => {
      void client.invalidateQueries({ queryKey: ['programs'] })
      void navigate(`/programs/${program.id}`)
    },
  })

  const preview = useQuery({
    queryKey: ['builder-preview', splitId, assistance],
    queryFn: () => services.exercises.count(),
  })

  const build = (): void => {
    const recipe = defaultRecipe(
      {
        squat: asExerciseId(MAIN_LIFT_SLUGS.squat),
        bench: asExerciseId(MAIN_LIFT_SLUGS.bench),
        deadlift: asExerciseId(MAIN_LIFT_SLUGS.deadlift),
        press: asExerciseId(MAIN_LIFT_SLUGS.press),
      },
      {
        name,
        description: `${split?.name ?? ''} · ${SUPPLEMENTAL_LABELS[supplemental]}`,
        splitId,
        settings: {
          units: settings.units,
          roundingIncrement: settings.roundingIncrement,
          trainingMaxPercent,
          defaultRestSeconds: 120,
        },
        assistance: {
          ...DEFAULT_ASSISTANCE,
          policy: assistance,
          landmarks: settings.landmarks,
          maxSlotsPerDay: maxSlots,
        },
        cycles: {
          count: cycles,
          ...(peaking ? { peaking: { ...DEFAULT_PEAKING, enabled: true } } : {}),
        },
      },
    )

    create.mutate({
      ...recipe,
      framework: {
        ...recipe.framework,
        includeWarmups,
        supplemental: {
          ...DEFAULT_BBB,
          style: supplemental,
          sets: supplementalSets,
          reps: supplementalReps,
          percent: supplementalPercent,
        },
        trainingMaxProgression: {
          ...recipe.framework.trainingMaxProgression,
          upperIncrement,
          lowerIncrement,
        },
      },
    })
  }

  return (
    <div>
      <Link
        to="/programs"
        className={cn(buttonStyles({ variant: 'ghost', size: 'sm' }), '-ml-3 px-3')}
      >
        <ArrowLeft size={16} aria-hidden />
        Programs
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Build a program</h1>
        <p className="text-ink-500 mt-1 text-sm">
          Everything here becomes an ordinary editable program — this form is a starting point, not
          a limit.
        </p>
      </header>

      <Section title="Name">
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          aria-label="Program name"
          className="bg-ink-850 border-ink-800 text-ink-50 tap-target w-full rounded-xl border px-3"
        />
      </Section>

      <Section title="Split" description="How many days, and which main lift lands on each of them">
        <div className="space-y-2">
          {BUILT_IN_SPLITS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => {
                setSplitId(candidate.id)
              }}
              className={cn(
                'w-full rounded-xl border p-3 text-left transition-colors',
                splitId === candidate.id
                  ? 'border-accent-500 bg-accent-500/10'
                  : 'border-ink-800 bg-ink-850 hover:border-ink-700',
              )}
            >
              <span className="text-ink-50 block text-sm font-semibold">{candidate.name}</span>
              <span className="text-ink-500 mt-0.5 block text-xs">{candidate.description}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Supplemental work" description="The volume that follows each main lift">
        <div className="mb-3 space-y-2">
          {SUPPLEMENTAL_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => {
                setSupplemental(style)
              }}
              className={cn(
                'w-full rounded-xl border p-3 text-left text-sm transition-colors',
                supplemental === style
                  ? 'border-accent-500 bg-accent-500/10 text-ink-50'
                  : 'border-ink-800 bg-ink-850 text-ink-300 hover:border-ink-700',
              )}
            >
              {SUPPLEMENTAL_LABELS[style]}
            </button>
          ))}
        </div>

        {supplemental !== 'none' && (
          <Card className="grid grid-cols-3 gap-3">
            <NumberSetting label="Sets" value={supplementalSets} onChange={setSupplementalSets} />
            <NumberSetting label="Reps" value={supplementalReps} onChange={setSupplementalReps} />
            <NumberSetting
              label="% TM"
              value={supplementalPercent}
              onChange={setSupplementalPercent}
              disabled={supplemental !== 'bbb'}
              hint={supplemental === 'bbb' ? undefined : 'Follows the wave'}
            />
          </Card>
        )}
      </Section>

      <Section
        title="Assistance"
        description="Filled to your weekly volume targets, after the framework has taken its share"
      >
        <div className="mb-3 flex gap-2">
          <Button
            variant={assistance === 'rp-landmarks' ? 'primary' : 'outline'}
            className="flex-1"
            onClick={() => {
              setAssistance('rp-landmarks')
            }}
          >
            Fill to targets
          </Button>
          <Button
            variant={assistance === 'none' ? 'primary' : 'outline'}
            className="flex-1"
            onClick={() => {
              setAssistance('none')
            }}
          >
            None
          </Button>
        </div>

        {assistance === 'rp-landmarks' && (
          <Card>
            <NumberSetting
              label="Max accessories per session"
              value={maxSlots}
              onChange={setMaxSlots}
            />
            <p className="text-ink-500 mt-3 text-xs">
              Volume targets come from your landmarks in Settings. A bench day under Boring But Big
              already spends eight chest sets, so it will get little or no extra chest work — the
              budget goes where the framework did not reach.
            </p>
            <details className="mt-3">
              <summary className="text-ink-300 cursor-pointer text-xs font-medium">
                Current weekly targets
              </summary>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {MUSCLE_GROUPS.map((muscle) => (
                  <li key={muscle} className="text-ink-500 flex justify-between text-xs">
                    <span>{MUSCLE_GROUP_LABELS[muscle]}</span>
                    <span className="numeric">
                      {settings.landmarks[muscle].mev}–{settings.landmarks[muscle].mav}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        )}
      </Section>

      <Section title="Progression and cycles">
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting
              label={`Upper +${settings.units}/cycle`}
              value={upperIncrement}
              onChange={setUpperIncrement}
            />
            <NumberSetting
              label={`Lower +${settings.units}/cycle`}
              value={lowerIncrement}
              onChange={setLowerIncrement}
            />
          </div>

          <NumberSetting
            label="Training max (% of 1RM)"
            value={trainingMaxPercent}
            onChange={setTrainingMaxPercent}
          />

          <Toggle
            label="Include warm-up ramps"
            checked={includeWarmups}
            onChange={setIncludeWarmups}
          />

          <Toggle
            label="Finish with a peaking block and a 1RM test"
            checked={peaking}
            onChange={(next) => {
              setPeaking(next)
              // A peak has to come after a finite number of cycles;
              // "repeat forever, then peak" never reaches the peak.
              if (next && cycles === 'indefinite') setCycles(3)
            }}
          />

          {peaking && (
            <NumberSetting
              label="Cycles before peaking"
              value={cycles === 'indefinite' ? 3 : cycles}
              onChange={setCycles}
            />
          )}
        </Card>
      </Section>

      <Button
        variant="primary"
        size="lg"
        full
        disabled={create.isPending || preview.data === 0}
        onClick={build}
      >
        <Wand2 size={20} aria-hidden />
        {create.isPending ? 'Building…' : 'Build program'}
      </Button>

      {create.isError && (
        <p className="text-bad-500 mt-3 text-sm" role="alert">
          {create.error.message}
        </p>
      )}
    </div>
  )
}

interface NumberSettingProps {
  readonly label: string
  readonly value: number
  readonly onChange: (value: number) => void
  readonly disabled?: boolean | undefined
  readonly hint?: string | undefined
}

function NumberSetting({ label, value, onChange, disabled, hint }: NumberSettingProps) {
  const id = `setting-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`

  return (
    <div>
      <label htmlFor={id} className="text-ink-500 mb-1 block text-xs font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
        className="numeric bg-ink-850 border-ink-800 text-ink-50 tap-target w-full rounded-lg border px-3 text-center disabled:opacity-40"
      />
      {hint !== undefined && <p className="text-ink-500 mt-1 text-xs">{hint}</p>}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string
  readonly checked: boolean
  readonly onChange: (value: boolean) => void
}) {
  return (
    <label className="tap-target flex cursor-pointer items-center justify-between gap-3">
      <span className="text-ink-100 text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked)
        }}
        className="size-5 shrink-0"
      />
    </label>
  )
}
