import { ArrowDown, ArrowUp, Minus, Sparkles } from 'lucide-react'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { Badge, Button, Card, Section } from '@/components/shared/primitives'
import { useSettings } from '@/app/context'

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

/**
 * The estimate this session just measured, offered to the setting it is
 * the basis for.
 *
 * The number was already on this screen and there was no way to keep it.
 * `estimatedMaxes` drives every suggested load in the app, the session
 * had just produced a better reading of it than the stored one, and the
 * only route between the two was reading the figure off here and typing
 * it into Settings from memory. That is the same defect as a rule
 * nothing can reach, wearing the clothes of a completed feature.
 *
 * **Offered, never applied.** It is a proposal with its evidence beside
 * it — the same stance the file import takes, and the same one
 * `adjust-landmarks` was built with. An estimate that moved on its own
 * after every session would make the loads shift for reasons the lifter
 * did not choose and could not see.
 *
 * Unreliable readings are excluded rather than shown with a warning: a
 * set of fifteen produces a number the formula is not fitted for, and
 * writing it into the basis for every future load is worse than leaving
 * the basis alone.
 */
function ApplyEstimates({ progress }: { readonly progress: WorkoutReport['progress'] }) {
  const { settings, update } = useSettings()

  const worth = progress.filter((entry) => {
    if (entry.estimate?.isReliable !== true) return false

    const stored = settings.estimatedMaxes[entry.exerciseId]
    if (stored === undefined) return true

    // A pound either way is the rounding, not a stronger lifter.
    return Math.abs(entry.estimate.value - stored) >= 1
  })

  if (worth.length === 0) return null

  return (
    <div className="border-ink-800 mt-3 border-t pt-3">
      <p className="text-ink-500 mb-2 text-xs">
        {worth.length === 1 ? 'This reading differs' : 'These readings differ'} from what your
        suggested loads are based on. Nothing changes unless you say so.
      </p>

      <ul className="mb-2 space-y-1">
        {worth.map((entry) => {
          const stored = settings.estimatedMaxes[entry.exerciseId]

          return (
            <li key={entry.exerciseId} className="flex justify-between gap-3 text-xs">
              <span className="text-ink-300 truncate">{entry.name}</span>
              <span className="text-ink-500 numeric shrink-0">
                {stored === undefined ? 'not set' : formatLoad(stored, settings.units)} →{' '}
                <span className="text-ink-100">
                  {formatLoad(Math.round(entry.estimate?.value ?? 0), settings.units)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      <Button
        variant="outline"
        size="sm"
        full
        onClick={() => {
          update({
            estimatedMaxes: {
              ...settings.estimatedMaxes,
              ...Object.fromEntries(
                worth.map(
                  (entry) => [entry.exerciseId, Math.round(entry.estimate?.value ?? 0)] as const,
                ),
              ),
            },
          })
        }}
      >
        Use {worth.length === 1 ? 'this estimate' : 'these estimates'}
      </Button>
    </div>
  )
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
        <Section
          title="Volume"
          description="Working sets, counted whole and only for the muscle each was programmed for"
        >
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

            <ApplyEstimates progress={report.progress} />
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
