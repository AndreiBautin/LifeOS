import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { forkProgram, saveProgram } from '@/application/use-cases/programs/manage-programs'
import { useServices, useSettings } from '@/app/context'
import { asProgramId, type ProgramId } from '@/domain/ids/ids'
import { describePrescription } from '@/domain/programs/prescription'
import { SLOT_ROLE_LABELS, type ProgramTemplate, type ProgramWeek } from '@/domain/programs/program'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import { SlotEditor } from './SlotEditor'

/**
 * One program, week by week.
 *
 * Everything shown here is editable in place. A built-in is forked on
 * first edit rather than being locked, so the shipped programs are a
 * starting point that cannot be lost and the lifter never meets a
 * read-only screen.
 */
export function ProgramDetailPage() {
  const { programId } = useParams<{ programId: string }>()
  const services = useServices()
  const { settings } = useSettings()
  const client = useQueryClient()
  const navigate = useNavigate()

  const [blockIndex, setBlockIndex] = useState(0)
  const [weekIndex, setWeekIndex] = useState(0)
  const [editingSlot, setEditingSlot] = useState<string | undefined>(undefined)

  const id = programId === undefined ? undefined : asProgramId(programId)

  const program = useQuery({
    queryKey: ['program', id],
    enabled: id !== undefined,
    queryFn: () =>
      id === undefined ? null : services.programs.byId(id).then((found) => found ?? null),
  })

  const exercises = useQuery({ queryKey: ['exercises'], queryFn: () => services.exercises.all() })

  const save = useMutation({
    mutationFn: (next: ProgramTemplate) => saveProgram(next, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['program', id] })
      void client.invalidateQueries({ queryKey: ['programs'] })
    },
  })

  const fork = useMutation({
    mutationFn: (source: ProgramId) =>
      forkProgram(source, `${program.data?.name ?? 'Program'} (copy)`, services),
    onSuccess: (created) => {
      void client.invalidateQueries({ queryKey: ['programs'] })
      void navigate(`/programs/${created.id}`)
    },
  })

  const remove = useMutation({
    mutationFn: (target: ProgramId) => services.programs.remove(target),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['programs'] })
      void navigate('/programs')
    },
  })

  if (program.data == null) {
    return (
      <div>
        <BackLink />
        <Card className="mt-4">
          <p className="text-ink-500 text-sm">
            {program.isLoading ? 'Loading…' : 'That program no longer exists.'}
          </p>
        </Card>
      </div>
    )
  }

  const template = program.data
  const block = template.blocks[blockIndex]
  const week = block?.weeks[weekIndex]

  /**
   * An edit to a built-in forks it first. The lifter keeps their change
   * and the shipped original stays recoverable, so no program ever needs
   * to be read-only.
   */
  const applyEdit = (next: ProgramTemplate): void => {
    if (template.origin === 'built-in') {
      fork.mutate(template.id)
      return
    }
    save.mutate(next)
  }

  return (
    <div>
      <BackLink />

      <header className="mt-3 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">{template.name}</h1>
            <p className="text-ink-500 mt-1 text-sm">{template.description}</p>
          </div>
          {template.origin === 'built-in' && <Badge>built-in</Badge>}
        </div>

        {template.origin === 'built-in' && (
          <p className="text-ink-500 mt-3 text-xs">
            Editing this will make a copy first, so the original stays available.
          </p>
        )}
      </header>

      {template.blocks.length > 1 && (
        <Section title="Block">
          <div className="flex flex-wrap gap-2">
            {template.blocks.map((candidate, index) => (
              <Button
                key={candidate.index}
                size="sm"
                variant={index === blockIndex ? 'primary' : 'outline'}
                onClick={() => {
                  setBlockIndex(index)
                  setWeekIndex(0)
                }}
              >
                {candidate.label}
              </Button>
            ))}
          </div>
        </Section>
      )}

      {block !== undefined && (
        <Section
          title="Week"
          description={
            block.repeat === 'indefinite'
              ? 'This block repeats indefinitely'
              : `Repeats ${String(block.repeat)}×`
          }
        >
          <div className="flex flex-wrap gap-2">
            {block.weeks.map((candidate, index) => (
              <Button
                key={candidate.index}
                size="sm"
                variant={index === weekIndex ? 'primary' : 'outline'}
                onClick={() => {
                  setWeekIndex(index)
                }}
              >
                {candidate.isDeload ? '↓ ' : ''}
                {index + 1}
              </Button>
            ))}
          </div>
        </Section>
      )}

      {week !== undefined && (
        <WeekView
          week={week}
          units={settings.units}
          exerciseName={(exerciseId) =>
            exercises.data?.find((exercise) => exercise.id === exerciseId)?.name ?? exerciseId
          }
          editingSlot={editingSlot}
          onEditSlot={setEditingSlot}
          onSlotChange={(dayIndex, slotIndex, updated) => {
            applyEdit(replaceSlot(template, blockIndex, weekIndex, dayIndex, slotIndex, updated))
            setEditingSlot(undefined)
          }}
          exercises={exercises.data ?? []}
        />
      )}

      {block !== undefined && block.progression.length > 0 && (
        <Section title="Progression" description="Applied when a cycle finishes">
          <Card>
            <ul className="space-y-2">
              {block.progression.map((rule, index) => (
                <li key={index} className="text-ink-300 text-sm">
                  {rule.label}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      <div className="mt-8 flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={fork.isPending}
          onClick={() => {
            fork.mutate(template.id)
          }}
        >
          <Copy size={16} aria-hidden />
          Duplicate
        </Button>
        {template.origin !== 'built-in' && (
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(template.id)
            }}
            aria-label="Delete this program"
          >
            <Trash2 size={16} aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/programs"
      className={cn(buttonStyles({ variant: 'ghost', size: 'sm' }), '-ml-3 px-3')}
    >
      <ArrowLeft size={16} aria-hidden />
      Programs
    </Link>
  )
}

interface WeekViewProps {
  readonly week: ProgramWeek
  readonly units: string
  readonly exerciseName: (id: string) => string
  readonly editingSlot: string | undefined
  readonly onEditSlot: (slotId: string | undefined) => void
  readonly onSlotChange: (
    dayIndex: number,
    slotIndex: number,
    slot: ProgramWeek['days'][number]['slots'][number],
  ) => void
  readonly exercises: readonly { readonly id: string; readonly name: string }[]
}

function WeekView({
  week,
  exerciseName,
  editingSlot,
  onEditSlot,
  onSlotChange,
  exercises,
}: WeekViewProps) {
  return (
    <Section title={week.label} description={week.isDeload ? 'Deload week' : undefined}>
      <div className="space-y-4">
        {week.days.map((day, dayIndex) => (
          <Card key={day.index}>
            <h3 className="text-ink-50 mb-3 font-semibold">{day.label}</h3>

            <ul className="space-y-2">
              {day.slots.map((slot, slotIndex) => (
                <li key={slot.id}>
                  {editingSlot === slot.id ? (
                    <SlotEditor
                      slot={slot}
                      exercises={exercises}
                      onCancel={() => {
                        onEditSlot(undefined)
                      }}
                      onSave={(updated) => {
                        onSlotChange(dayIndex, slotIndex, updated)
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onEditSlot(slot.id)
                      }}
                      className="border-ink-800 bg-ink-850 hover:border-ink-700 tap-target w-full rounded-xl border px-3 py-2 text-left"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-ink-100 truncate text-sm font-medium">
                          {slot.exercise.kind === 'specific'
                            ? exerciseName(slot.exercise.exerciseId)
                            : slot.exercise.label}
                        </span>
                        <Badge tone={slot.role === 'main' ? 'accent' : 'neutral'}>
                          {SLOT_ROLE_LABELS[slot.role]}
                        </Badge>
                      </span>
                      <span className="text-ink-500 numeric mt-1 block text-xs">
                        {summariseSets(slot.sets)}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Section>
  )
}

/** Collapses runs of identical prescriptions: "3 × 50% TM × 10". */
function summariseSets(
  sets: readonly { readonly load: unknown; readonly reps: unknown; readonly isWarmup?: boolean }[],
): string {
  const working = sets.filter((set) => set.isWarmup !== true)
  if (working.length === 0) return 'no working sets'

  const grouped: { label: string; count: number }[] = []
  for (const set of working) {
    const label = describePrescription(set as Parameters<typeof describePrescription>[0])
    const last = grouped[grouped.length - 1]
    if (last?.label === label) last.count += 1
    else grouped.push({ label, count: 1 })
  }

  return grouped
    .map(({ label, count }) => (count === 1 ? label : `${String(count)} × ${label}`))
    .join(' · ')
}

function replaceSlot(
  template: ProgramTemplate,
  blockIndex: number,
  weekIndex: number,
  dayIndex: number,
  slotIndex: number,
  slot: ProgramWeek['days'][number]['slots'][number],
): ProgramTemplate {
  return {
    ...template,
    blocks: template.blocks.map((block, bIndex) =>
      bIndex !== blockIndex
        ? block
        : {
            ...block,
            weeks: block.weeks.map((week, wIndex) =>
              wIndex !== weekIndex
                ? week
                : {
                    ...week,
                    days: week.days.map((day, dIndex) =>
                      dIndex !== dayIndex
                        ? day
                        : {
                            ...day,
                            slots: day.slots.map((existing, sIndex) =>
                              sIndex === slotIndex ? slot : existing,
                            ),
                          },
                    ),
                  },
            ),
          },
    ),
  }
}
