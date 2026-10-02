import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import {
  previousTopSet,
  topSetIn,
  versusLast,
  type Performance,
  type Versus,
} from '@/domain/logging/versus-last'
import {
  totalTonnage,
  totalWorkingSets,
  type LogEntry,
  type WorkoutLog,
} from '@/domain/logging/workout-log'
import { sessionRecords, type SessionRecord } from '@/domain/logging/records'
import type { WorkoutRepository } from '@/domain/repositories/ports'

/**
 * A past session, opened.
 *
 * The history list could be deleted from and reopened and never read: a
 * finished session's sets were reachable only through the report that
 * closed it, and that report is gone the moment you press Done. This is
 * the same reading, on demand — every entry with its top set and how that
 * top set did against **the session before this one**, so a session
 * opened in December is judged against November rather than against
 * today.
 */
export interface SessionDetail {
  readonly workout: WorkoutLog
  readonly sets: number
  readonly tonnage: number
  /** Absent for a session with no completion stamp (abandoned early). */
  readonly minutes?: number
  readonly entries: readonly EntryDetail[]
  /** Personal records the session set, one per exercise. */
  readonly records: readonly SessionRecord[]
}

export interface EntryDetail {
  readonly entry: LogEntry
  readonly top?: Performance
  readonly previous?: Performance
  readonly versus?: Versus
}

/** Reads only — asked for as the two queries it makes, not the repository. */
export interface SessionDetailDeps {
  readonly workouts: Pick<WorkoutRepository, 'byId' | 'forExercise'>
}

export async function sessionDetail(
  id: WorkoutId,
  deps: SessionDetailDeps,
): Promise<SessionDetail | undefined> {
  const workout = await deps.workouts.byId(id)
  if (workout === undefined) return undefined

  // One history read per exercise, shared by every entry of it.
  const ids = [...new Set(workout.entries.map((entry) => entry.exerciseId))]
  const histories = new Map<ExerciseId, readonly WorkoutLog[]>(
    await Promise.all(
      ids.map(
        async (exerciseId) => [exerciseId, await deps.workouts.forExercise(exerciseId)] as const,
      ),
    ),
  )

  const entries = workout.entries.map((entry): EntryDetail => {
    const top = topSetIn(workout, entry.exerciseId, entry.variant)
    const previous = previousTopSet(
      histories.get(entry.exerciseId) ?? [],
      workout,
      entry.exerciseId,
      entry.variant,
    )
    const versus =
      top === undefined || previous === undefined ? undefined : versusLast(top, previous)
    return {
      entry,
      ...(top === undefined ? {} : { top }),
      ...(previous === undefined ? {} : { previous }),
      ...(versus === undefined ? {} : { versus }),
    }
  })

  /*
   * A session that finished the minute it started has no length worth
   * reporting — it was filed in one go, or stamped by an import — so it
   * reads as unknown rather than as "0 min".
   */
  const elapsed =
    workout.completedAt === undefined
      ? 0
      : Math.round(
          (new Date(workout.completedAt).getTime() - new Date(workout.startedAt).getTime()) /
            60_000,
        )
  const minutes = elapsed > 0 ? elapsed : undefined

  return {
    workout,
    sets: totalWorkingSets(workout),
    tonnage: totalTonnage(workout),
    ...(minutes === undefined ? {} : { minutes }),
    entries,
    records: recordsIn(workout, [...histories.values()].flat()),
  }
}

/** The records this session set, against every session in its exercises' history. */
function recordsIn(workout: WorkoutLog, history: readonly WorkoutLog[]): readonly SessionRecord[] {
  const logs = new Map<WorkoutId, WorkoutLog>()
  for (const log of history) logs.set(log.id, log)
  logs.set(workout.id, workout)
  return sessionRecords([...logs.values()]).get(workout.id) ?? []
}
