import type { ExerciseId } from '@/domain/ids/ids'
import { asExerciseId } from '@/domain/ids/ids'
import { estimateOneRepMax, type E1rmFormula } from '@/domain/strength/one-rep-max'

/**
 * Reading estimated maxes out of the 5/3/1 app this one replaces.
 *
 * Only the maxes. The sessions themselves are deliberately not imported:
 * they were run under a different framework, with different rep ranges
 * and a different idea of what a hard set is, so folding them into the
 * volume and fatigue history would compare quantities that are not the
 * same quantity. What survives a change of program is how strong the
 * lifter is, and that is what this extracts.
 *
 * The file is a numeric-keyed object graph with no schema, so this is
 * mostly a decoding table, derived by reconciling loads against the
 * training maxes each cycle records.
 */

const F = {
  cycles: '1',
  cycleWorkouts: '7',
  workoutSets: '3',
  workoutCompletedAt: '8',
  setExercise: '1',
  setReps: '2',
  /** The load the app calculated, before rounding to what is loadable. */
  setCalculatedLoad: '3',
  setType: '4',
  setStatus: '5',
  /** The load actually put on the bar. Present once a set has been done. */
  setActualLoad: '13',
} as const

const SET_TYPE_WARMUP = 0
const STATUS_COMPLETED = 1

/**
 * The four lifts the old app tracked, identified by reconciling every
 * logged load against the training max its cycle records.
 *
 * The overhead press is here because it was trained, not because it is a
 * strength lift — it was a main lift under 5/3/1 only because that
 * framework wanted a fourth one. It carries an estimate like any other
 * exercise; it contributes nothing to a total.
 */
const LEGACY_LIFTS: Readonly<Record<number, ExerciseId>> = {
  0: asExerciseId('overhead-press'),
  1: asExerciseId('bench-press'),
  2: asExerciseId('low-bar-squat'),
  3: asExerciseId('sumo-deadlift'),
}

/**
 * Past this many reps the formulas stop meaning much — they are fitted to
 * low-rep work, and a set of twenty says more about work capacity than
 * about a one-rep max.
 */
const MAX_REPS_FOR_ESTIMATE = 10

export interface LegacyMax {
  readonly exerciseId: ExerciseId
  /** Rounded, because a suggested load carrying two decimals is false precision. */
  readonly estimatedMax: number
  /** The set it came from, so the number can be judged rather than trusted. */
  readonly fromLoad: number
  readonly fromReps: number
  readonly onDate: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberAt(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringAt(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * The best estimate each lift produced, across the whole file.
 *
 * Only completed work sets count. Warm-ups are excluded because they are
 * not efforts; sets that were skipped or never reached are excluded
 * because they did not happen, and the export stores its future schedule
 * in the same array as its past — a set that has not been performed looks
 * identical to one that has, apart from its status.
 */
export function parseLegacyMaxes(
  raw: unknown,
  formula: E1rmFormula = 'epley',
): readonly LegacyMax[] {
  const root = isRecord(raw) ? raw : {}
  const program = isRecord(root.program) ? root.program : {}
  const cycles = program[F.cycles]

  const best = new Map<number, LegacyMax>()

  for (const cycle of Array.isArray(cycles) ? cycles : []) {
    if (!isRecord(cycle)) continue

    const sessions = cycle[F.cycleWorkouts]

    for (const session of Array.isArray(sessions) ? (sessions as readonly unknown[]) : []) {
      if (!isRecord(session)) continue
      if (stringAt(session, F.workoutCompletedAt) === undefined) continue

      const date = (stringAt(session, '1') ?? '').slice(0, 10)
      const sets = session[F.workoutSets]

      for (const rawSet of Array.isArray(sets) ? sets : []) {
        if (!isRecord(rawSet)) continue

        const legacyId = numberAt(rawSet, F.setExercise)
        if (legacyId === undefined) continue

        const exerciseId = LEGACY_LIFTS[legacyId]
        if (exerciseId === undefined) continue

        if (numberAt(rawSet, F.setStatus) !== STATUS_COMPLETED) continue
        if (numberAt(rawSet, F.setType) === SET_TYPE_WARMUP) continue

        const load = numberAt(rawSet, F.setActualLoad) ?? numberAt(rawSet, F.setCalculatedLoad)
        const reps = numberAt(rawSet, F.setReps)
        if (load === undefined || load <= 0) continue
        if (reps === undefined || reps <= 0 || reps > MAX_REPS_FOR_ESTIMATE) continue

        const estimate = estimateOneRepMax(load, reps, formula).value
        const previous = best.get(legacyId)
        if (previous !== undefined && previous.estimatedMax >= estimate) continue

        best.set(legacyId, {
          exerciseId,
          estimatedMax: Math.round(estimate),
          fromLoad: load,
          fromReps: reps,
          onDate: date,
        })
      }
    }
  }

  return [...best.values()].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))
}
