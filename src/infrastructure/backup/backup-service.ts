import type {
  BackupCounts,
  BackupData,
  BackupEnvelope,
  ImportMode,
  ImportPreview,
  MergeEffect,
} from '@/domain/backup/envelope'
import {
  BACKUP_MAGIC,
  BACKUP_SCHEMA_VERSION,
  countsFor,
  validateEnvelope,
} from '@/domain/backup/envelope'
import { checksumOf, verifyChecksum } from '@/domain/backup/checksum'
import type { AppSettings } from '@/domain/settings/settings'
import type {
  CheckInRepository,
  ExerciseRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'

/**
 * Export and import.
 *
 * With no server, this is the only mechanism by which a lifter's data
 * survives a new phone, a cleared browser, or a switch from Chrome to
 * Safari. It is therefore treated as a core feature rather than a
 * settings-page afterthought: the file is versioned, checksummed,
 * human-readable, and complete enough that restoring from it alone
 * reproduces the app exactly.
 */

export interface BackupRepositories {
  readonly exercises: ExerciseRepository
  readonly workouts: WorkoutRepository
  readonly checkIns: CheckInRepository
}

export interface ExportOptions {
  readonly settings: AppSettings
  readonly appVersion: string
  readonly now: Date
}

export async function buildBackup(
  repositories: BackupRepositories,
  options: ExportOptions,
): Promise<BackupEnvelope> {
  const [exercises, workouts, checkIns] = await Promise.all([
    repositories.exercises.all(),
    repositories.workouts.all(),
    repositories.checkIns.all(),
  ])

  const data: BackupData = {
    settings: options.settings,
    exercises,
    workouts,
    checkIns,
  }

  return {
    magic: BACKUP_MAGIC,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: options.appVersion,
    exportedAt: options.now.toISOString(),
    checksum: checksumOf(data),
    counts: countsFor(data),
    data,
  }
}

/** Two-space JSON, so the file is readable in a text editor. */
export function serialiseBackup(envelope: BackupEnvelope): string {
  return JSON.stringify(envelope, null, 2)
}

export function backupFilename(now: Date): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `lift-backup-${stamp}.json`
}

/* -------------------------------------------------------------------- */
/* Import                                                                */
/* -------------------------------------------------------------------- */

export interface ParsedBackup {
  readonly preview: ImportPreview
  readonly envelope?: BackupEnvelope
}

/**
 * Parses and checks a file without writing anything.
 *
 * The preview is shown before an import proceeds — "142 workouts,
 * 3 programs, March 2024 to August 2026" is how a lifter recognises they
 * picked the right file, and it is the last chance to notice they did not.
 */
export function parseBackup(contents: string): ParsedBackup {
  let parsed: unknown

  try {
    parsed = JSON.parse(contents)
  } catch {
    return {
      preview: {
        valid: false,
        problems: [{ severity: 'error', message: 'The file is not valid JSON.' }],
      },
    }
  }

  const preview = validateEnvelope(parsed)
  if (!preview.valid) return { preview }

  const envelope = parsed as BackupEnvelope

  if (!verifyChecksum(envelope.data, envelope.checksum)) {
    return {
      preview: {
        ...preview,
        valid: false,
        problems: [
          ...preview.problems,
          {
            severity: 'error',
            message:
              'The backup failed its integrity check. It was probably truncated or partially written — importing it could restore incomplete history. Try another copy.',
          },
        ],
      },
    }
  }

  return { preview, envelope }
}

/**
 * What a merge would actually do, counted against what is already stored.
 */
export async function previewMerge(
  envelope: BackupEnvelope,
  repositories: BackupRepositories,
): Promise<MergeEffect> {
  const [exercises, workouts, checkIns] = await Promise.all([
    repositories.exercises.all(),
    repositories.workouts.all(),
    repositories.checkIns.all(),
  ])

  const existing = {
    exercises: new Set(exercises.map((item) => item.id as string)),
    workouts: new Set(workouts.map((item) => item.id as string)),
    checkIns: new Set(checkIns.map((item) => item.id as string)),
  }

  const added: Record<keyof BackupCounts, number> = {
    exercises: 0,
    workouts: 0,
    checkIns: 0,
  }
  const updated: Record<keyof BackupCounts, number> = { ...added }

  const tally = (key: keyof BackupCounts, ids: readonly string[]): void => {
    for (const id of ids) {
      if (existing[key].has(id)) updated[key] += 1
      else added[key] += 1
    }
  }

  tally(
    'exercises',
    envelope.data.exercises.map((item) => item.id),
  )
  tally(
    'workouts',
    envelope.data.workouts.map((item) => item.id),
  )
  tally(
    'checkIns',
    envelope.data.checkIns.map((item) => item.id),
  )

  const unchanged: BackupCounts = {
    exercises: existing.exercises.size - updated.exercises,
    workouts: existing.workouts.size - updated.workouts,
    checkIns: existing.checkIns.size - updated.checkIns,
  }

  return { added, updated, unchanged }
}

export interface ImportResult {
  readonly imported: BackupCounts
  readonly settings?: AppSettings
}

/**
 * Writes an already-validated backup into the repositories.
 *
 * `merge` writes every record by id, so a record present in both is
 * overwritten by the file's version and anything only in the database
 * survives. `replace` is the caller's responsibility to clear first — the
 * wipe is a separate named operation precisely so that no call site can
 * ask to merge and receive a wipe.
 */
export async function applyBackup(
  envelope: BackupEnvelope,
  repositories: BackupRepositories,
  mode: ImportMode,
): Promise<ImportResult> {
  const { data } = envelope

  await repositories.exercises.saveMany(data.exercises)

  for (const workout of data.workouts) await repositories.workouts.save(workout)
  for (const checkIn of data.checkIns) await repositories.checkIns.save(checkIn)

  return {
    imported: countsFor(data),
    // Settings are only adopted on a full replace. Merging someone else's
    // training maxes into a live setup would silently rewrite every
    // percentage the program prescribes.
    ...(mode === 'replace' ? { settings: data.settings } : {}),
  }
}
