import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramTemplate } from '@/domain/programs/program'
import type { ProgramInstance } from '@/domain/repositories/ports'
import type { AppSettings } from '@/domain/settings/settings'

/**
 * The backup file format.
 *
 * This app stores everything on the device and talks to no server, which
 * makes export and import the only way data survives a new phone, a
 * cleared browser, or a switch from Chrome to Safari. That makes this
 * format load-bearing rather than a convenience, and it is versioned and
 * checksummed accordingly.
 *
 * Design constraints, in order of importance:
 *
 *   - **Readable.** Plain JSON with stable ids. Someone opening the file
 *     in a text editor five years from now should be able to see their
 *     training history, whether or not this app still exists.
 *   - **Self-describing.** The schema version travels with the data, so
 *     an old file can be migrated rather than rejected.
 *   - **Verifiable.** A checksum catches a truncated or partially-written
 *     file before it is merged into a working database.
 *   - **Complete.** A restore from this file alone must reproduce the app
 *     exactly. A backup that silently omits settings is worse than none,
 *     because it is trusted.
 */

export const BACKUP_SCHEMA_VERSION = 1

export const BACKUP_MAGIC = 'lift.backup'

export interface BackupEnvelope {
  /** Identifies the file as ours before anything else is parsed. */
  readonly magic: typeof BACKUP_MAGIC
  readonly schemaVersion: number
  readonly appVersion: string
  readonly exportedAt: string
  /** Over the canonical JSON of `data`. See `checksum.ts`. */
  readonly checksum: string
  readonly counts: BackupCounts
  readonly data: BackupData
}

export interface BackupCounts {
  readonly exercises: number
  readonly programs: number
  readonly instances: number
  readonly workouts: number
  readonly checkIns: number
}

export interface BackupData {
  readonly settings: AppSettings
  readonly exercises: readonly Exercise[]
  readonly programs: readonly ProgramTemplate[]
  readonly instances: readonly ProgramInstance[]
  readonly workouts: readonly WorkoutLog[]
  readonly checkIns: readonly CheckIn[]
}

export function countsFor(data: BackupData): BackupCounts {
  return {
    exercises: data.exercises.length,
    programs: data.programs.length,
    instances: data.instances.length,
    workouts: data.workouts.length,
    checkIns: data.checkIns.length,
  }
}

/* -------------------------------------------------------------------- */
/* Import                                                                */
/* -------------------------------------------------------------------- */

/**
 * How an import combines with what is already there.
 *
 * Two named operations rather than one function with a flag, so a caller
 * cannot ask for one and receive the other. `replace` is destructive and
 * the UI requires a typed confirmation before offering it.
 */
export type ImportMode = 'merge' | 'replace'

export interface ImportPreview {
  readonly valid: boolean
  readonly schemaVersion?: number
  readonly exportedAt?: string
  readonly appVersion?: string
  readonly counts?: BackupCounts
  /** Earliest and latest workout dates, so a lifter recognises the file. */
  readonly dateRange?: { readonly from: string; readonly to: string }
  /** Records that would be added, updated, or left alone under `merge`. */
  readonly mergeEffect?: MergeEffect
  readonly problems: readonly ImportProblem[]
}

export interface MergeEffect {
  readonly added: BackupCounts
  readonly updated: BackupCounts
  readonly unchanged: BackupCounts
}

export interface ImportProblem {
  readonly severity: 'error' | 'warning'
  readonly message: string
}

/**
 * Validates the shape of a parsed file without trusting any of it.
 *
 * A backup arrives from the file system, which is a trust boundary: the
 * file may be truncated, hand-edited, from a future version, or not a
 * backup at all. Everything is checked before a single record reaches the
 * database.
 */
export function validateEnvelope(candidate: unknown): ImportPreview {
  const problems: ImportProblem[] = []

  if (typeof candidate !== 'object' || candidate === null) {
    return {
      valid: false,
      problems: [{ severity: 'error', message: 'The file is not valid JSON.' }],
    }
  }

  const envelope = candidate as Partial<BackupEnvelope>

  if (envelope.magic !== BACKUP_MAGIC) {
    return {
      valid: false,
      problems: [
        {
          severity: 'error',
          message: 'This does not look like a Lift backup. Check you picked the right file.',
        },
      ],
    }
  }

  if (typeof envelope.schemaVersion !== 'number') {
    return {
      valid: false,
      problems: [{ severity: 'error', message: 'The backup is missing its schema version.' }],
    }
  }

  if (envelope.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      schemaVersion: envelope.schemaVersion,
      problems: [
        {
          severity: 'error',
          message: `This backup was written by a newer version of Lift (schema ${String(envelope.schemaVersion)}, this app reads ${String(BACKUP_SCHEMA_VERSION)}). Update the app before importing.`,
        },
      ],
    }
  }

  // Deliberately read as an untyped bag from here on. The declared
  // `BackupData` type describes what a *valid* file contains; treating the
  // input as already being that shape is how a validator ends up asserting
  // conditions the compiler has decided cannot fail.
  const data: unknown = envelope.data
  if (typeof data !== 'object' || data === null) {
    return {
      valid: false,
      schemaVersion: envelope.schemaVersion,
      problems: [{ severity: 'error', message: 'The backup contains no data section.' }],
    }
  }

  const bag = data as Record<string, unknown>

  for (const key of ['exercises', 'programs', 'instances', 'workouts', 'checkIns'] as const) {
    if (!Array.isArray(bag[key])) {
      problems.push({
        severity: 'error',
        message: `The backup's "${key}" section is missing or malformed.`,
      })
    }
  }

  const { settings, workouts: rawWorkouts } = bag
  if (typeof settings !== 'object' || settings === null) {
    problems.push({
      severity: 'warning',
      message: 'The backup has no settings; defaults will be used.',
    })
  }

  const errors = problems.filter((problem) => problem.severity === 'error')
  if (errors.length > 0) {
    return { valid: false, schemaVersion: envelope.schemaVersion, problems }
  }

  const workouts = rawWorkouts as readonly WorkoutLog[]
  const dates = workouts.map((workout) => workout.date).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]

  return {
    valid: true,
    schemaVersion: envelope.schemaVersion,
    ...(envelope.exportedAt !== undefined ? { exportedAt: envelope.exportedAt } : {}),
    ...(envelope.appVersion !== undefined ? { appVersion: envelope.appVersion } : {}),
    counts: countsFor(bag as unknown as BackupData),
    ...(from !== undefined && to !== undefined ? { dateRange: { from, to } } : {}),
    problems,
  }
}
