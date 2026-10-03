import type { Exercise } from '@/domain/exercises/exercise'
import { MUSCLE_GROUPS, type MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import { mondayOf, shiftDay } from '@/domain/time/day'

import { workingSets, type WorkoutLog } from './workout-log'

/** How many weeks a row's strip covers, this one included. */
export const LIBRARY_WEEKS = 12

export interface LibraryRow {
  readonly exercise: Exercise
  /** Named in the week the routine runs. */
  readonly inWeek: boolean
  /** The last day it had a working set, if ever. */
  readonly lastDone?: string
  /** Working sets in each of the last {@link LIBRARY_WEEKS} weeks, oldest first. */
  readonly weeks: readonly number[]
}

export interface LibraryShelf {
  readonly muscle: MuscleGroup
  readonly rows: readonly LibraryRow[]
}

/**
 * The whole catalogue, shelved by the muscle each exercise is for.
 *
 * **A row carries its last three months as working sets per calendar
 * week**, so the shelf answers "have I been doing this" without opening
 * anything. A row the routine names leads its shelf, then the most
 * recently done, then by name — the order somebody browsing for a swap
 * wants. A retired exercise appears only if it was ever done: its history
 * is real, and an archived movement nobody did is noise.
 */
export function libraryShelves(
  exercises: readonly Exercise[],
  logs: readonly WorkoutLog[],
  scheduled: ReadonlySet<ExerciseId>,
  today: string,
): readonly LibraryShelf[] {
  const firstMonday = shiftDay(mondayOf(today), -7 * (LIBRARY_WEEKS - 1))
  const weeks = new Map<ExerciseId, number[]>()
  const last = new Map<ExerciseId, string>()

  for (const log of logs) {
    if (log.status === 'in-progress') continue
    for (const entry of log.entries) {
      const sets = workingSets(entry).length
      if (sets === 0) continue
      const before = last.get(entry.exerciseId)
      if (before === undefined || log.date > before) last.set(entry.exerciseId, log.date)
      if (log.date < firstMonday || log.date > today) continue
      const at = Math.round(
        (Date.parse(mondayOf(log.date)) - Date.parse(firstMonday)) / (7 * 86_400_000),
      )
      const strip = weeks.get(entry.exerciseId) ?? Array<number>(LIBRARY_WEEKS).fill(0)
      strip[at] = (strip[at] ?? 0) + sets
      weeks.set(entry.exerciseId, strip)
    }
  }

  const rows = exercises
    .filter((exercise) => !exercise.isArchived || last.has(exercise.id))
    .map((exercise): LibraryRow => {
      const lastDone = last.get(exercise.id)
      return {
        exercise,
        inWeek: scheduled.has(exercise.id),
        ...(lastDone === undefined ? {} : { lastDone }),
        weeks: weeks.get(exercise.id) ?? Array<number>(LIBRARY_WEEKS).fill(0),
      }
    })

  return MUSCLE_GROUPS.flatMap((muscle) => {
    const shelf = rows
      .filter((row) => row.exercise.primaryMuscle === muscle)
      .toSorted(
        (a, b) =>
          Number(b.inWeek) - Number(a.inWeek) ||
          (b.lastDone ?? '').localeCompare(a.lastDone ?? '') ||
          a.exercise.name.localeCompare(b.exercise.name),
      )
    return shelf.length === 0 ? [] : [{ muscle, rows: shelf }]
  })
}
