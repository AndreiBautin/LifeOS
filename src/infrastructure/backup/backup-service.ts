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
import type { Exercise } from '@/domain/exercises/exercise'
import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { Tombstone } from '@/domain/sync/tombstone'
import { indexTombstones, shouldAccept } from '@/domain/sync/tombstone'
import type {
  CheckInRepository,
  ExerciseRepository,
  TombstoneRepository,
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
  readonly tombstones: TombstoneRepository
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
  const [exercises, workouts, checkIns, tombstones] = await Promise.all([
    repositories.exercises.all(),
    repositories.workouts.all(),
    repositories.checkIns.all(),
    repositories.tombstones.all(),
  ])

  const data: BackupData = {
    settings: options.settings,
    exercises,
    workouts,
    checkIns,
    tombstones,
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
  const [exercises, workouts, checkIns, localTombstones] = await Promise.all([
    repositories.exercises.all(),
    repositories.workouts.all(),
    repositories.checkIns.all(),
    repositories.tombstones.all(),
  ])

  // Counted the way it will be applied, or the preview is a different
  // answer to the one the button gives.
  const accepted = acceptable(envelope, localTombstones)

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
    accepted.exercises.map((item) => item.id),
  )
  tally(
    'workouts',
    accepted.workouts.map((item) => item.id),
  )
  tally(
    'checkIns',
    accepted.checkIns.map((item) => item.id),
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

  /*
   * The file's deletions are adopted before its records are written.
   *
   * Both directions matter. A record this device deleted must not come
   * back because the file predates the deletion, and a record the *file*
   * deleted must not survive here because this device never saw it
   * happen. Recording the incoming tombstones first is what makes the
   * second true on the next merge in either direction.
   */
  const localTombstones = await repositories.tombstones.all()
  if (data.tombstones !== undefined && data.tombstones.length > 0) {
    await repositories.tombstones.record(data.tombstones)
  }

  const accepted = acceptable(envelope, localTombstones)

  await repositories.exercises.restoreMany(accepted.exercises)
  await repositories.workouts.restoreMany(accepted.workouts)
  await repositories.checkIns.restoreMany(accepted.checkIns)

  return {
    imported: countsFor({ ...data, ...accepted }),
    // Settings are only adopted on a full replace. Merging someone else's
    // training maxes into a live setup would silently rewrite every
    // percentage the program prescribes.
    ...(mode === 'replace' ? { settings: data.settings } : {}),
  }
}

/**
 * The subset of a backup that survives this device's deletions.
 *
 * Shared by the preview and the apply so the count shown on the button
 * is the count the button produces. They were separate walks over the
 * same data once, which is exactly the shape of thing that drifts.
 */
function acceptable(
  envelope: BackupEnvelope,
  localTombstones: readonly Tombstone[],
): {
  readonly exercises: readonly Exercise[]
  readonly workouts: readonly WorkoutLog[]
  readonly checkIns: readonly CheckIn[]
} {
  const index = indexTombstones(localTombstones)
  const { data } = envelope

  return {
    exercises: data.exercises.filter((item) => shouldAccept(item, 'exercises', item.id, index)),
    workouts: data.workouts.filter((item) => shouldAccept(item, 'workouts', item.id, index)),
    checkIns: data.checkIns.filter((item) => shouldAccept(item, 'checkIns', item.id, index)),
  }
}
