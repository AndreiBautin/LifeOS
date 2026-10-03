import type { WorkoutLog } from './workout-log'

/**
 * Every set ever logged as CSV, a row a set, for a spreadsheet.
 *
 * **Not the backup and must not become one.** The backup is the whole
 * database with a checksum, made to be read back in; this is one flat
 * table made to be read by something else, and nothing imports it. Oldest
 * first, the way a spreadsheet's rows are read. Skipped and pending sets
 * are included with their outcome, so the file says what the log says.
 */
const HEADER = [
  'date',
  'session',
  'status',
  'exercise',
  'version',
  'set',
  'warm-up',
  'outcome',
  'load',
  'reps',
  'note',
]

export function setsCsv(
  logs: readonly WorkoutLog[],
  nameOf: (exerciseId: string) => string,
): string {
  const rows = logs
    .filter((log) => log.status !== 'in-progress')
    .toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))
    .flatMap((log) =>
      log.entries.flatMap((entry) =>
        entry.sets.map((set, index) => [
          log.date,
          log.title,
          log.status,
          nameOf(entry.exerciseId),
          entry.variant ?? '',
          String(index + 1),
          set.isWarmup ? 'yes' : '',
          set.outcome,
          set.actualLoad === undefined ? '' : String(set.actualLoad),
          set.actualReps === undefined ? '' : String(set.actualReps),
          set.notes ?? '',
        ]),
      ),
    )
  return [HEADER, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Quoted when it holds a comma, a quote or a line break; quotes doubled. */
function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}
