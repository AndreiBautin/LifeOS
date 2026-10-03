import type { LoggedSet } from '@/domain/logging/workout-log'

/**
 * Whether a set can be logged as planned without typing anything: the
 * plan holds a load, or there is nothing to type (a warm-up, a block of
 * time). An open slot has no load to confirm, and logging it blank would
 * file a set with no weight.
 *
 * One answer for the row's check, its swipe and the keyboard, so the
 * three cannot disagree about which sets a single action may log.
 */
export function canLogPlanned(set: LoggedSet): boolean {
  return (
    set.outcome === 'pending' &&
    (set.plannedLoad !== undefined || set.isWarmup || set.prescription.reps.kind === 'time')
  )
}

/** The set's plan as a result — nothing added to a bodyweight set is the body alone. */
export function plannedResult(
  set: LoggedSet,
  bodyweight: boolean,
): { readonly load?: number; readonly reps?: number } {
  return {
    ...(set.plannedLoad !== undefined && !(bodyweight && set.plannedLoad === 0)
      ? { load: set.plannedLoad }
      : {}),
    ...(set.plannedReps !== undefined ? { reps: set.plannedReps } : {}),
  }
}
