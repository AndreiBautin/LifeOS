import type { WorkoutId } from '@/domain/ids/ids'

import type { WorkoutLog } from './workout-log'

/**
 * Finding a session in a history of hundreds.
 *
 * **A search reads what a person remembers**: the day ("legs b"), an
 * exercise in it ("front squat" — only one actually done, not one
 * skipped), or a word from a note ("knee"). Case and spacing do not
 * matter; every word typed must match somewhere, so "squat knee" narrows
 * rather than widens. The day chips and Records narrow further.
 */
export interface HistoryFilter {
  readonly query: string
  /** A day's name — "Legs B" — or undefined for every day. */
  readonly day?: string | undefined
  readonly recordsOnly: boolean
}

export const NO_FILTER: HistoryFilter = { query: '', recordsOnly: false }

export function isFiltering(filter: HistoryFilter): boolean {
  return filter.query.trim() !== '' || filter.day !== undefined || filter.recordsOnly
}

/** "Friday — Legs B" → "Legs B"; a title with no weekday is its own name. */
export function dayNameOf(title: string): string {
  const [, ...rest] = title.split(' — ')
  return rest.length === 0 ? title : rest.join(' — ')
}

export function filterHistory(
  logs: readonly WorkoutLog[],
  filter: HistoryFilter,
  nameOf: (exerciseId: string) => string,
  recordCount: (id: WorkoutId) => number,
): readonly WorkoutLog[] {
  const words = filter.query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')
  return logs.filter((log) => {
    if (filter.day !== undefined && dayNameOf(log.title) !== filter.day) return false
    if (filter.recordsOnly && recordCount(log.id) === 0) return false
    if (words.length === 0) return true

    const haystack = [
      log.title,
      log.notes ?? '',
      ...log.entries.flatMap((entry) => [
        entry.sets.some((set) => !set.isWarmup && set.outcome === 'completed')
          ? nameOf(entry.exerciseId)
          : '',
        ...entry.sets.map((set) => set.notes ?? ''),
      ]),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
