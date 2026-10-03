import type { LogEntry, WorkoutLog } from './workout-log'

/**
 * Two accessories done back to back, a set of one then a set of the
 * other, resting only after the pair — what a lifter does to save time
 * when the session is long and the two do not compete for the same muscle.
 *
 * **Stored on the log, as a group name both entries carry** (`superset`),
 * because a log describes itself: history reads how the session was run
 * without the program having to remember it. Only accessory work pairs —
 * a competition lift wants its full rest, and a warm-up or a block of
 * conditioning has none to share.
 */
export function canPair(a: LogEntry | undefined, b: LogEntry | undefined): boolean {
  const accessory = (entry: LogEntry | undefined) =>
    entry !== undefined &&
    (entry.role === 'hypertrophy' || entry.role === 'assistance') &&
    entry.superset === undefined &&
    entry.sets.some((set) => set.outcome === 'pending')
  return accessory(a) && accessory(b)
}

/** Pairs an entry with the one after it. Identity when the two cannot pair. */
export function pairWithNext(workout: WorkoutLog, entryIndex: number): WorkoutLog {
  const first = workout.entries[entryIndex]
  const second = workout.entries[entryIndex + 1]
  if (first === undefined || second === undefined || !canPair(first, second)) return workout
  const group = `${String(first.order)}+${String(second.order)}`
  return {
    ...workout,
    entries: workout.entries.map((entry, at) =>
      at === entryIndex || at === entryIndex + 1 ? { ...entry, superset: group } : entry,
    ),
  }
}

/** Splits the pair an entry belongs to, both halves at once. */
export function unpair(workout: WorkoutLog, entryIndex: number): WorkoutLog {
  const group = workout.entries[entryIndex]?.superset
  if (group === undefined) return workout
  return {
    ...workout,
    entries: workout.entries.map((entry) => {
      if (entry.superset !== group) return entry
      const { superset: _group, ...rest } = entry
      return rest
    }),
  }
}

/** The other half of an entry's pair, by index, if it has one. */
export function partnerOf(workout: WorkoutLog, entryIndex: number): number | undefined {
  const group = workout.entries[entryIndex]?.superset
  if (group === undefined) return undefined
  const at = workout.entries.findIndex(
    (entry, index) => index !== entryIndex && entry.superset === group,
  )
  return at === -1 ? undefined : at
}
