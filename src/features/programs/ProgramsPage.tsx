import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { startProgram } from '@/application/use-cases/programs/manage-programs'
import { useServices, useSettings } from '@/app/context'
import type { ProgramId } from '@/domain/ids/ids'
import { daysPerWeek, totalWeeks, type ProgramTemplate } from '@/domain/programs/program'
import { Badge, Button, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'
import { logger } from '@/shared/logging/logger'

/**
 * The program library.
 *
 * Built-ins and a lifter's own programs sit in the same list and are
 * rendered identically, because they *are* identical — every built-in is
 * produced by the same assembler from an ordinary recipe. Nothing here is
 * a locked preset, so nothing needs a different affordance.
 */
export function ProgramsPage() {
  const services = useServices()
  const { athlete } = useSettings()
  const client = useQueryClient()

  const programs = useQuery({ queryKey: ['programs'], queryFn: () => services.programs.all() })
  const activeInstance = useQuery({
    queryKey: ['instance', 'active'],
    queryFn: () => services.instances.active().then((instance) => instance ?? null),
  })

  const start = useMutation({
    mutationFn: (programId: ProgramId) => startProgram(programId, athlete, services),
    onSuccess: (result) => {
      logger.info('program.start', { missingMaxes: result.missingTrainingMaxes.length })
      void client.invalidateQueries({ queryKey: ['instance'] })
    },
  })

  const running = activeInstance.data

  return (
    <div>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Programs</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            {programs.data?.length ?? 0} available · edit any of them
          </p>
        </div>
        <Link to="/programs/new" className={cn(buttonStyles({ variant: 'primary', size: 'sm' }))}>
          <Plus size={16} aria-hidden />
          Build
        </Link>
      </header>

      {running != null && (
        <Section title="Running now">
          <Card className="border-accent-500/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-ink-50 truncate font-semibold">{running.name}</h3>
                <p className="text-ink-500 mt-0.5 text-sm">
                  Cycle {running.cycleNumber} · week {running.weekIndex + 1} · day{' '}
                  {running.dayIndex + 1}
                </p>
              </div>
              <Link to="/train" className={cn(buttonStyles({ variant: 'primary', size: 'sm' }))}>
                <Play size={16} aria-hidden />
                Train
              </Link>
            </div>
          </Card>
        </Section>
      )}

      <Section title="Library">
        {programs.data === undefined ? (
          <Card>
            <p className="text-ink-500 text-sm">Loading…</p>
          </Card>
        ) : programs.data.length === 0 ? (
          <Empty title="No programs yet">
            <p>Build one from scratch, or reinstall the built-in library from Settings.</p>
          </Empty>
        ) : (
          <ul className="space-y-3">
            {programs.data.map((program) => (
              <li key={program.id}>
                <ProgramCard
                  program={program}
                  isRunning={running?.programId === program.id}
                  onStart={() => {
                    start.mutate(program.id)
                  }}
                  starting={start.isPending}
                />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

interface CardProps {
  readonly program: ProgramTemplate
  readonly isRunning: boolean
  readonly onStart: () => void
  readonly starting: boolean
}

function ProgramCard({ program, isRunning, onStart, starting }: CardProps) {
  const weeks = totalWeeks(program)
  const days = daysPerWeek(program)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-ink-50 font-semibold">{program.name}</h3>
          <p className="text-ink-500 mt-1 text-sm">{program.description}</p>
        </div>
        {program.origin === 'built-in' && <Badge>built-in</Badge>}
        {program.origin === 'fork' && <Badge tone="accent">fork</Badge>}
      </div>

      <div className="text-ink-500 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>
          {weeks} week{weeks === 1 ? '' : 's'} per cycle
        </span>
        <span>
          {days} day{days === 1 ? '' : 's'} per week
        </span>
        {program.requiredTrainingMaxes.length > 0 && (
          <span>{program.requiredTrainingMaxes.length} training maxes</span>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Link
          to={`/programs/${program.id}`}
          className={cn(buttonStyles({ variant: 'outline', size: 'sm' }), 'flex-1')}
        >
          Open
        </Link>
        <Button
          variant={isRunning ? 'secondary' : 'primary'}
          size="sm"
          className="flex-1"
          disabled={isRunning || starting}
          onClick={onStart}
        >
          {isRunning ? 'Running' : 'Start'}
        </Button>
      </div>
    </Card>
  )
}
