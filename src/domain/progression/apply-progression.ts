import type { ExerciseId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { amrapResult } from '@/domain/logging/workout-log'
import type {
  ProgressionCondition,
  ProgressionRule,
  SlotSelector,
} from '@/domain/programs/progression-rule'
import { applyDelta } from '@/domain/programs/progression-rule'
import type { RoundingMode } from '@/domain/units/weight'
import { roundLoad } from '@/domain/units/weight'

/**
 * Running a cycle's progression rules against what was actually logged.
 *
 * The rules describe intent; this evaluates them. Kept apart from both the
 * program (which stores the rules) and the log (which stores the evidence)
 * so that a progression can be previewed before it is committed — "your
 * squat training max is going from 315 to 325" is something a lifter
 * should see and be able to override, not something that happens to them.
 *
 * Every effect is returned as a described change rather than applied in
 * place, for the same reason the landmark proposals are: the app should
 * never silently alter a program someone spent time building.
 */

export interface ProgressionInput {
  readonly rules: readonly ProgressionRule[]
  /** Every workout logged during the cycle that just finished. */
  readonly cycleLogs: readonly WorkoutLog[]
  readonly trainingMaxes: Readonly<Partial<Record<ExerciseId, number>>>
  readonly roundingIncrement: number
  readonly roundingMode?: RoundingMode
}

export interface TrainingMaxChange {
  readonly exerciseId: ExerciseId
  readonly from: number
  readonly to: number
  readonly reason: string
}

export interface PercentChange {
  readonly ruleLabel: string
  readonly selector: SlotSelector
  readonly deltaPercent: number
  readonly maxPercent?: number
  readonly reason: string
}

export interface ProgressionOutcome {
  readonly trainingMaxChanges: readonly TrainingMaxChange[]
  readonly percentChanges: readonly PercentChange[]
  readonly setChanges: readonly { readonly ruleLabel: string; readonly delta: number }[]
  /** Rules that did not fire, with why — shown so nothing looks broken. */
  readonly skipped: readonly { readonly ruleLabel: string; readonly reason: string }[]
}

export function applyProgression(input: ProgressionInput): ProgressionOutcome {
  const trainingMaxChanges: TrainingMaxChange[] = []
  const percentChanges: PercentChange[] = []
  const setChanges: { ruleLabel: string; delta: number }[] = []
  const skipped: { ruleLabel: string; reason: string }[] = []

  const round = (value: number): number =>
    roundLoad(value, input.roundingIncrement, input.roundingMode)

  for (const rule of input.rules) {
    const verdict = evaluateCondition(rule.condition, input.cycleLogs)

    if (!verdict.fired) {
      skipped.push({ ruleLabel: rule.label, reason: verdict.reason })
      continue
    }

    switch (rule.kind) {
      case 'adjust-training-max': {
        for (const exerciseId of targetExercises(rule.exercises, input.trainingMaxes)) {
          const current = input.trainingMaxes[exerciseId]
          if (current === undefined) continue

          const next = round(applyDelta(current, rule.delta))
          if (next === current) continue

          trainingMaxChanges.push({
            exerciseId,
            from: current,
            to: next,
            reason: rule.label,
          })
        }
        break
      }

      case 'reset-training-max': {
        for (const exerciseId of targetExercises(rule.exercises, input.trainingMaxes)) {
          const current = input.trainingMaxes[exerciseId]
          if (current === undefined) continue

          const next = round(current * (rule.toPercent / 100))
          if (next === current) continue

          trainingMaxChanges.push({
            exerciseId,
            from: current,
            to: next,
            reason: rule.label,
          })
        }
        break
      }

      case 'adjust-load-percent': {
        percentChanges.push({
          ruleLabel: rule.label,
          selector: rule.selector,
          deltaPercent: rule.deltaPercent,
          ...(rule.maxPercent !== undefined ? { maxPercent: rule.maxPercent } : {}),
          reason: rule.label,
        })
        break
      }

      case 'adjust-sets': {
        setChanges.push({ ruleLabel: rule.label, delta: rule.delta })
        break
      }

      case 'adjust-absolute-load':
      case 'adjust-reps': {
        // Handled where the slot is edited rather than here; these rules
        // describe changes to a prescription's own numbers, which the
        // program editor applies directly.
        break
      }
    }
  }

  // A raise and a reset on the same lift means the AMRAP both met and
  // missed its minimum, which cannot happen — but if a hand-edited rule
  // set produced it, the reset is the safe reading.
  return {
    trainingMaxChanges: resolveConflicts(trainingMaxChanges),
    percentChanges,
    setChanges,
    skipped,
  }
}

interface Verdict {
  readonly fired: boolean
  readonly reason: string
}

function evaluateCondition(condition: ProgressionCondition, logs: readonly WorkoutLog[]): Verdict {
  switch (condition.kind) {
    case 'always':
      return { fired: true, reason: 'Applies every cycle.' }

    case 'amrap-at-least': {
      const results = amrapResults(logs, condition.selector)
      if (results.length === 0) {
        return { fired: false, reason: 'No AMRAP set was logged this cycle.' }
      }
      const shortfall = results.filter(
        (result) => result.reps < Math.max(result.minimum, condition.reps),
      )
      return shortfall.length === 0
        ? { fired: true, reason: 'Every AMRAP set met its minimum.' }
        : { fired: false, reason: `${String(shortfall.length)} AMRAP set(s) came up short.` }
    }

    case 'amrap-below': {
      const results = amrapResults(logs, condition.selector)
      if (results.length === 0) {
        return { fired: false, reason: 'No AMRAP set was logged this cycle.' }
      }
      const shortfall = results.filter(
        (result) => result.reps < Math.max(result.minimum, condition.reps),
      )
      return shortfall.length > 0
        ? { fired: true, reason: `${String(shortfall.length)} AMRAP set(s) came up short.` }
        : { fired: false, reason: 'Every AMRAP set met its minimum.' }
    }

    case 'all-sets-completed': {
      const anySkipped = logs.some((log) =>
        log.entries.some((entry) =>
          entry.sets.some((set) => set.outcome === 'skipped' || set.outcome === 'failed'),
        ),
      )
      return anySkipped
        ? { fired: false, reason: 'Some sets were skipped or missed this cycle.' }
        : { fired: true, reason: 'Every prescribed set was completed.' }
    }

    case 'rpe-at-most': {
      const rpes = logs.flatMap((log) =>
        log.entries.flatMap((entry) =>
          entry.sets.flatMap((set) => (set.actualRpe !== undefined ? [set.actualRpe] : [])),
        ),
      )
      if (rpes.length === 0) return { fired: false, reason: 'No RPE was recorded this cycle.' }

      const average = rpes.reduce((sum, rpe) => sum + rpe, 0) / rpes.length
      return average <= condition.rpe
        ? { fired: true, reason: `Average RPE was ${average.toFixed(1)}.` }
        : { fired: false, reason: `Average RPE was ${average.toFixed(1)}, above the threshold.` }
    }
  }
}

function amrapResults(
  logs: readonly WorkoutLog[],
  selector: SlotSelector,
): readonly { readonly reps: number; readonly minimum: number }[] {
  const role = selector.kind === 'role' ? selector.role : 'main'
  return logs.flatMap((log) => {
    const result = amrapResult(log, role)
    return result === undefined ? [] : [{ reps: result.reps, minimum: result.minimum }]
  })
}

function targetExercises(
  target: readonly ExerciseId[] | 'all',
  trainingMaxes: Readonly<Partial<Record<ExerciseId, number>>>,
): readonly ExerciseId[] {
  return target === 'all' ? (Object.keys(trainingMaxes) as ExerciseId[]) : target
}

/** A reset beats a raise on the same lift. */
function resolveConflicts(changes: readonly TrainingMaxChange[]): readonly TrainingMaxChange[] {
  const byExercise = new Map<ExerciseId, TrainingMaxChange>()

  for (const change of changes) {
    const existing = byExercise.get(change.exerciseId)
    if (existing === undefined || change.to < existing.to) {
      byExercise.set(change.exerciseId, change)
    }
  }

  return [...byExercise.values()]
}

/** Folds accepted training-max changes into a new map. */
export function applyTrainingMaxChanges(
  current: Readonly<Partial<Record<ExerciseId, number>>>,
  changes: readonly TrainingMaxChange[],
): Readonly<Partial<Record<ExerciseId, number>>> {
  if (changes.length === 0) return current

  const next: Partial<Record<ExerciseId, number>> = { ...current }
  for (const change of changes) {
    next[change.exerciseId] = change.to
  }
  return next
}
