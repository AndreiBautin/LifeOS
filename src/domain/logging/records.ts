import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { Performance } from '@/domain/logging/versus-last'
import { workingSets, type WorkoutLog } from '@/domain/logging/workout-log'

/**
 * Personal records: a set better than every set of the exercise before it.
 *
 * **Two kinds, and the heavier one wins the name.** The heaviest bar ever
 * is the record anyone means first; more reps than ever at a bar at least
 * this heavy is the record double progression is made of. A set that is
 * both is reported as the first, so a row carries one badge.
 *
 * **There is no estimated-max record, and it was written and removed.**
 * Beating every earlier estimate needs more reps than any earlier set at
 * a bar at least this heavy — which is the rep record already. The third
 * kind could never fire on its own; its test found that.
 *
 * **The first time is not a record.** Every exercise's first set would
 * otherwise be one, and a badge on everything new says nothing.
 *
 * A missing load is the body alone, as everywhere else: a bodyweight
 * movement has rep records and no load records until a belt goes on.
 */
export type RecordKind = 'heaviest' | 'reps'

const RANK: Readonly<Record<RecordKind, number>> = { heaviest: 0, reps: 1 }

export function recordFor(
  set: Performance,
  before: readonly Performance[],
): RecordKind | undefined {
  if (set.reps === undefined || set.reps <= 0 || before.length === 0) return undefined
  const load = set.load ?? 0

  const heaviest = Math.max(...before.map((one) => one.load ?? 0))
  if (load > 0 && load > heaviest) return 'heaviest'

  const atLeastAsHeavy = before.filter((one) => (one.load ?? 0) >= load)
  const mostReps = Math.max(0, ...atLeastAsHeavy.map((one) => one.reps ?? 0))
  if (atLeastAsHeavy.length > 0 && set.reps > mostReps) return 'reps'

  return undefined
}

export interface SessionRecord {
  readonly exerciseId: ExerciseId
  readonly kind: RecordKind
  readonly set: Performance
}

/**
 * The records each finished session set, oldest first through history:
 * every set is judged against all the sets of its exercise that came
 * before it, then joins them. One record per exercise per session — the
 * most notable kind, and the first set to reach it.
 */
export function sessionRecords(
  logs: readonly WorkoutLog[],
): ReadonlyMap<WorkoutId, readonly SessionRecord[]> {
  const prior = new Map<ExerciseId, Performance[]>()
  const out = new Map<WorkoutId, SessionRecord[]>()

  const finished = logs
    .filter((log) => log.status === 'completed')
    .toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))

  for (const log of finished) {
    const best = new Map<ExerciseId, SessionRecord>()
    for (const entry of log.entries) {
      const before = prior.get(entry.exerciseId) ?? []
      for (const done of workingSets(entry)) {
        const set = { load: done.actualLoad, reps: done.actualReps }
        const kind = recordFor(set, before)
        const held = best.get(entry.exerciseId)
        if (kind !== undefined && (held === undefined || RANK[kind] < RANK[held.kind])) {
          best.set(entry.exerciseId, { exerciseId: entry.exerciseId, kind, set })
        }
        before.push(set)
      }
      prior.set(entry.exerciseId, before)
    }
    if (best.size > 0) out.set(log.id, [...best.values()])
  }
  return out
}

/** The label a record is shown under. */
export const RECORD_LABELS: Readonly<Record<RecordKind, string>> = {
  heaviest: 'Heaviest',
  reps: 'Rep PR',
}
