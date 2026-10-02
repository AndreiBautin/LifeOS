import { TrendingUp } from 'lucide-react'

import type { LoggedSet } from '@/domain/logging/workout-log'
import { ladderState, type LadderState } from '@/domain/programs/progression'
import type { RepRange } from '@/domain/programs/prescription'
import { formatLoad, type WeightUnit } from '@/domain/units/weight'
import { cn } from '@/lib/cn'

/**
 * Double progression, live, on the exercise being done.
 *
 * One column per working set, filled to the reps done against a dashed
 * line at the top of the range; a set not yet done is a ghost of its
 * planned reps. Underneath, one sentence on the only question the method
 * asks — does this session earn the next load — answered as the sets
 * land rather than discovered next week.
 */
export function LadderStrip({
  sets,
  range,
  step,
  units,
  bodyweight,
}: {
  readonly sets: readonly LoggedSet[]
  readonly range: RepRange
  readonly step: number
  readonly units: WeightUnit
  readonly bodyweight: boolean
}) {
  const working = sets.filter((set) => !set.isWarmup)
  if (working.length === 0) return null

  const state = ladderState(
    working.map((set) => ({
      reps: set.actualReps,
      done: set.outcome === 'completed' && set.actualReps !== undefined,
      planned: set.plannedReps,
    })),
    range,
  )
  // Room above the top line, so a set that overshoots reads as one.
  const ceiling = range.high * 1.25
  const bump = bodyweight ? 'more reps' : `+${formatLoad(step, units)}`

  return (
    <div
      className={cn(
        'mt-4 rounded-xl border px-3 pt-3 pb-2.5 transition-colors',
        state.kind === 'earned'
          ? 'border-accent-500/50 bg-accent-500/10 ladder-earned'
          : 'border-ink-800 bg-ink-950/40',
      )}
    >
      <div className="relative flex h-14 items-end gap-1.5" aria-hidden>
        <div
          className="border-ink-500/60 absolute inset-x-0 border-t border-dashed"
          style={{ bottom: `${String((range.high / ceiling) * 100)}%` }}
        />
        <span
          className="text-ink-500 numeric absolute right-0 text-[0.65rem]"
          style={{ bottom: `calc(${String((range.high / ceiling) * 100)}% + 2px)` }}
        >
          {range.high}
        </span>
        {working.map((set, index) => {
          const done = set.outcome === 'completed' && set.actualReps !== undefined
          const reps = done ? (set.actualReps ?? 0) : (set.plannedReps ?? range.low)
          const height = `${String(Math.min(1, reps / ceiling) * 100)}%`
          const topped = done && reps >= range.high
          const onPlan = done && !topped && reps >= (set.plannedReps ?? range.high)
          return (
            <div key={index} className="flex h-full flex-1 items-end">
              <div
                className={cn(
                  'w-full rounded-t-md transition-[height] duration-500',
                  !done && 'border-ink-700 border border-dashed bg-transparent',
                  done && topped && 'bg-accent-400 shadow-[0_0_12px_-2px_var(--color-accent-400)]',
                  onPlan && 'bg-accent-500/45',
                  done && !topped && !onPlan && 'bg-ink-500',
                )}
                style={{ height }}
              />
            </div>
          )
        })}
      </div>
      <p
        className={cn(
          'mt-2 flex items-center gap-1.5 text-xs',
          state.kind === 'earned' ? 'text-accent-400 font-semibold' : 'text-ink-300',
        )}
      >
        {state.kind === 'earned' && <TrendingUp size={13} aria-hidden />}
        {sentence(state, range, bump)}
      </p>
    </div>
  )
}

function sentence(state: LadderState, range: RepRange, bump: string): string {
  switch (state.kind) {
    case 'open':
      return `${String(range.high)} on all ${String(state.sets)} sets earns ${bump} next time.`
    case 'on-track':
      return `Every set at ${String(range.high)} so far — ${String(state.left)} to go for ${bump}.`
    case 'earned':
      return `Earned: ${bump} next session.`
    case 'building':
      return `On plan at ${String(state.reps)} — ${String(range.high)} on every set earns ${bump}.`
    case 'missed':
      return `Set ${String(state.set)} came in under plan at ${String(state.reps)} — same bar next time.`
  }
}
