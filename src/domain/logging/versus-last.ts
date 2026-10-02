import type { ExerciseId } from '@/domain/ids/ids'
import { workingSets, type WorkoutLog } from '@/domain/logging/workout-log'
import { sameVersion } from '@/domain/splits/rp-splits'

/**
 * How a logged set compares with the same set last time.
 *
 * Double progression is "beat last time until the top of the range, then
 * add weight", so the one question worth answering the moment a set is
 * filed is whether it did. The session player puts the answer on the row.
 *
 * **Load first, then reps**, because that is the order the method moves
 * them in: a heavier bar is progress whatever the reps did, and at the
 * same bar more reps are. A lighter bar is reported as lighter rather than
 * converted into an estimated max — a set of twelve at 95 and one of eight
 * at 115 are not comparable by any number the lifter would recognise.
 *
 * A missing load on either side is the body alone (a bodyweight set), so
 * two unloaded pull-up sets compare on reps.
 */

export type Versus =
  | { readonly kind: 'heavier'; readonly by: number }
  | { readonly kind: 'more-reps'; readonly by: number }
  | { readonly kind: 'matched' }
  | { readonly kind: 'fewer-reps'; readonly by: number }
  | { readonly kind: 'lighter'; readonly by: number }

export interface Performance {
  readonly load?: number | undefined
  readonly reps?: number | undefined
}

/** Undefined when either side has no reps to compare. */
export function versusLast(now: Performance, last: Performance): Versus | undefined {
  if (now.reps === undefined || last.reps === undefined) return undefined
  const load = now.load ?? 0
  const before = last.load ?? 0
  // Hundredths, so 2.5 and 1.25 plates subtract exactly.
  const loadDelta = Math.round((load - before) * 100) / 100
  if (loadDelta > 0) return { kind: 'heavier', by: loadDelta }
  if (loadDelta < 0) return { kind: 'lighter', by: -loadDelta }
  const repsDelta = now.reps - last.reps
  if (repsDelta > 0) return { kind: 'more-reps', by: repsDelta }
  if (repsDelta < 0) return { kind: 'fewer-reps', by: -repsDelta }
  return { kind: 'matched' }
}

/**
 * A session's top set for one exercise: the heaviest bar, and the most
 * reps at it. The same order `versusLast` reads, so the session report
 * and the set rows answer "did it beat last time" by one rule.
 */
export function topSet(sets: readonly Performance[]): Performance | undefined {
  return sets
    .filter((set) => set.reps !== undefined)
    .reduce<Performance | undefined>((best, set) => {
      if (best === undefined) return set
      const load = set.load ?? 0
      const bestLoad = best.load ?? 0
      if (load !== bestLoad) return load > bestLoad ? set : best
      return (set.reps ?? 0) > (best.reps ?? 0) ? set : best
    }, undefined)
}

/** The top set one session did of an exercise, in the given version. */
export function topSetIn(
  log: WorkoutLog,
  exerciseId: ExerciseId,
  variant: string | undefined,
): Performance | undefined {
  return topSet(
    log.entries
      .filter((entry) => entry.exerciseId === exerciseId && sameVersion(entry.variant, variant))
      .flatMap((entry) => workingSets(entry))
      .map((set) => ({ load: set.actualLoad, reps: set.actualReps })),
  )
}

/**
 * The top set of the last finished session **before** `current` that did
 * the exercise — before by start time, so a session looked at months
 * later is compared with the one that preceded it, not with today's.
 */
export function previousTopSet(
  history: readonly WorkoutLog[],
  current: WorkoutLog,
  exerciseId: ExerciseId,
  variant: string | undefined,
): Performance | undefined {
  return history
    .filter(
      (log) =>
        log.id !== current.id && log.status === 'completed' && log.startedAt < current.startedAt,
    )
    .toSorted((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((log) => topSetIn(log, exerciseId, variant))
    .find((set) => set !== undefined)
}

/** Progress is the two kinds the method counts as moving forward. */
export function isProgress(versus: Versus): boolean {
  return versus.kind === 'heavier' || versus.kind === 'more-reps'
}
