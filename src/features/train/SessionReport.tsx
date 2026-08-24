import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'

/**
 * What happened, immediately after finishing.
 *
 * StrengthFlow's post-workout report was the single best thing either old
 * app said to a lifter, and it is kept — though it arrived through an
 * `alert()` containing a string of newline-joined sentences. What is
 * added is the volume this session actually contributed per muscle,
 * counted by the same rules the planner used, because that is the number
 * the check-in loop is reasoning about and a lifter should be able to see
 * it.
 */

interface Props {
  readonly report: WorkoutReport
  readonly units: WeightUnit
  readonly onDismiss: () => void
}

export function SessionReport({ report, units, onDismiss }: Props) {
  return (
    <div>
      <header className="mb-6">
        <p className="text-accent-400 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <Sparkles size={14} aria-hidden />
          Session complete
        </p>
        <h1 className="text-ink-50 mt-1 text-2xl font-semibold tracking-tight">
          {report.workout.title}
        </h1>
        <p className="text-ink-300 mt-2">{report.headline}</p>
      </header>

      <div className="mb-8 grid grid-cols-3 gap-2">
        <Stat label="Working sets" value={String(report.workingSets)} />
        <Stat label="Tonnage" value={formatLoad(report.tonnage, units)} />
        <Stat label="Duration" value={`${String(report.durationMinutes)} min`} />
      </div>

      {report.volumeByMuscle.length > 0 && (
        <Section title="Volume" description="Hard sets, counting secondary work at half">
          <Card>
            <ul className="space-y-1.5">
              {report.volumeByMuscle.map(({ muscle, sets }) => (
                <li key={muscle} className="flex justify-between text-sm">
                  <span className="text-ink-300">{MUSCLE_GROUP_LABELS[muscle]}</span>
                  <span className="numeric text-ink-100 font-medium">{sets}</span>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {report.progress.length > 0 && (
        <Section title="Against last time">
          <Card>
            <ul className="space-y-2.5">
              {report.progress.map((entry) => (
                <li key={entry.exerciseId} className="flex items-center justify-between gap-3">
                  <span className="text-ink-100 truncate text-sm">{entry.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {entry.estimate !== undefined && (
                      <span className="text-ink-500 numeric text-xs">
                        e1RM {formatLoad(entry.estimate.value, units)}
                        {!entry.estimate.isReliable && '*'}
                      </span>
                    )}
                    <Verdict verdict={entry.verdict} />
                  </span>
                </li>
              ))}
            </ul>
            {report.progress.some((entry) => entry.estimate?.isReliable === false) && (
              <p className="text-ink-500 mt-3 text-xs">
                * Estimated from a high-rep set, where the formulas lose accuracy.
              </p>
            )}
          </Card>
        </Section>
      )}

      <Button variant="primary" size="lg" full onClick={onDismiss}>
        Done
      </Button>
    </div>
  )
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <Card className="p-3 text-center">
      <p className="numeric text-ink-50 text-xl font-semibold">{value}</p>
      <p className="text-ink-500 mt-0.5 text-xs">{label}</p>
    </Card>
  )
}

function Verdict({ verdict }: { readonly verdict: 'better' | 'matched' | 'worse' | 'new' }) {
  switch (verdict) {
    case 'better':
      return (
        <Badge tone="good">
          <ArrowUp size={12} aria-hidden className="mr-0.5" />
          up
        </Badge>
      )
    case 'worse':
      return (
        <Badge tone="bad">
          <ArrowDown size={12} aria-hidden className="mr-0.5" />
          down
        </Badge>
      )
    case 'matched':
      return (
        <Badge>
          <Minus size={12} aria-hidden className="mr-0.5" />
          held
        </Badge>
      )
    case 'new':
      return <Badge tone="accent">first time</Badge>
  }
}
