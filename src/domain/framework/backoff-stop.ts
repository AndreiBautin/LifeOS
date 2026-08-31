import { evaluateFatigue, type FatigueState, type PerformedSet } from '@/domain/framework/rts'
import { BACKOFF_VARIANT, TOP_SET_VARIANT } from '@/domain/framework/replan-backoffs'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import type { ExerciseId } from '@/domain/ids/ids'

/**
 * Reading the stopping rule off what has actually been logged.
 *
 * **The rule existed and nothing could reach it, which is the failure
 * this codebase keeps catching.** `evaluateFatigue`,
 * `accumulatedFatiguePercent`, `nextBackoffLoad` and `nextBackoffReps`
 * had no caller outside their own test — the whole live half of RTS. The
 * app planned back-off slots, printed a sentence saying *"when one comes
 * in at RPE 8, that is the drop and you are done"*, and then never read
 * the RPE you logged. Reported from real use: **RPE 8 on the second set,
 * and nothing happened.**
 *
 * Same shape as `proposeLandmarks`, as `readinessScore` feeding a session
 * adjustment nothing called, and as `moveDailyHome` with no control. A
 * rule nothing can reach is a rule nobody can trust; one that *prints
 * advice* about itself is worse, because the lifter believes it is
 * watching.
 *
 * This module is the adapter, deliberately kept out of `rts.ts`: the
 * framework works in `PerformedSet` and must not learn what a
 * `WorkoutLog` is. It reads one, and answers for one exercise.
 */

export interface BackoffStanding {
  readonly state: FatigueState
  /** Back-off sets still pending on this entry. */
  readonly remaining: number
}

/**
 * A set is evidence only when all three numbers are there.
 *
 * An implied max needs load, reps and RPE together; a set logged without
 * an RPE cannot say how close to failure it was, which is the whole
 * quantity the rule turns on. Treated as absent rather than guessed —
 * the same "absent, never zero" the rest of the app holds.
 */
function performed(set: LoggedSet): PerformedSet | undefined {
  if (set.outcome !== 'completed') return undefined
  if (set.actualLoad === undefined || set.actualReps === undefined) return undefined
  if (set.actualRpe === undefined) return undefined

  return { load: set.actualLoad, reps: set.actualReps, rpe: set.actualRpe }
}

/**
 * The RPE the lifter was told to watch for, off the set's own record.
 *
 * **The printed rule and the evaluated rule were not the same rule, and
 * rounding made them disagree almost every time.** The slot says "until
 * RPE 8" from a `stopRpe` baked into its prescription; the evaluation
 * asked whether the accumulated drop had reached the target percent.
 * Those agree only if the bar is exactly the drop — and the bar is
 * rounded to something you can load.
 *
 * Measured on a real session: a 305 top set drops 5% to 289.75, rounds
 * to 290, and 290 is **4.92%** lighter. At matched reps and RPE the
 * implied-max drop equals the bar drop, so RPE 8 on the back-off
 * accumulated 4.92% against a 5% target and the rule said keep going —
 * while the screen was telling the lifter to stop. Reported as exactly
 * that: RPE 8 on the second set and nothing happened.
 *
 * So the RPE is compared to the number that was displayed, read from the
 * record that displayed it. One rule, one source.
 */
function stopRpeOf(entry: LogEntry): number | undefined {
  for (const set of entry.sets) {
    const load = set.prescription.load
    if (load.kind === 'rts-backoff' && load.stopRpe !== undefined) return load.stopRpe
  }

  return undefined
}

function entryFor(
  workout: WorkoutLog,
  exerciseId: ExerciseId,
  variant: string,
): LogEntry | undefined {
  return workout.entries.find(
    (entry) => entry.exerciseId === exerciseId && entry.variant === variant,
  )
}

/**
 * Where the back-offs for one exercise stand.
 *
 * Absent when there is nothing to say: no back-off entry, or a top set
 * that has not been performed yet. **A top set with no RPE stops this
 * cold and that is correct** — every figure here is measured against the
 * implied max of that one set, and inventing it would make the rule fire
 * on a number nobody produced.
 *
 * `maxBackoffSets` comes from the entry itself rather than from the
 * recipe: the plan already materialised however many sets the day's
 * fatigue target asked for, and that count *is* the ceiling on this
 * screen. Reading it from settings instead would let the rule disagree
 * with the sets in front of the lifter.
 */
export function backoffStandingFor(
  workout: WorkoutLog,
  exerciseId: ExerciseId,
  fatigueTargetPercent: number,
): BackoffStanding | undefined {
  const backoffEntry = entryFor(workout, exerciseId, BACKOFF_VARIANT)
  if (backoffEntry === undefined) return undefined

  const topEntry = entryFor(workout, exerciseId, TOP_SET_VARIANT)
  const topSet = topEntry?.sets.map(performed).find((one) => one !== undefined)
  if (topSet === undefined) return undefined

  const backoffs = backoffEntry.sets
    .map(performed)
    .filter((one): one is PerformedSet => one !== undefined)

  const remaining = backoffEntry.sets.filter((set) => set.outcome === 'pending').length

  const state = evaluateFatigue(
    {
      fatigueTargetPercent,
      maxBackoffSets: backoffEntry.sets.length,
      // The rest of a prescription is about *planning* back-offs, which
      // has already happened by the time anything is logged. Only these
      // two decide whether to stop.
      topSetReps: 0,
      topSetRpe: 0,
      method: 'load-drop',
    },
    topSet,
    backoffs,
  )

  /*
   * The stated rule wins when it fires first. `evaluateFatigue` still
   * owns the other two ways to stop — the target reached on the
   * arithmetic, and the set cap — so this only ever *adds* a reason to
   * stop, never removes one.
   */
  const stopRpe = stopRpeOf(backoffEntry)
  const latest = backoffs[backoffs.length - 1]

  if (!state.shouldStop && stopRpe !== undefined && latest !== undefined && latest.rpe >= stopRpe) {
    return {
      state: {
        ...state,
        shouldStop: true,
        reason: `RPE ${String(latest.rpe)} at the drop weight — that is the RPE ${String(stopRpe)} you were watching for.`,
      },
      remaining,
    }
  }

  return { state, remaining }
}
