import type { Place } from '@/domain/atlas/place/Place'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { AppSettings } from '@/domain/settings/settings'
import type { Tombstone } from '@/domain/sync/tombstone'

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

/**
 * Version 2 added `tombstones`. Version 3 adds the absorbed areas.
 *
 * The rule at the top of this file — a restore from one file must
 * reproduce the app exactly — stopped being true the moment this hub
 * gained a backlog, a quest log, a tech tree, a circle, a review and an
 * atlas. Five areas' worth of records were outside the only export the
 * app has, on a device whose storage a browser can clear without asking.
 * A partial backup is worse than none, because it is trusted.
 *
 * Older files stay readable. Every section added here is optional on
 * read and a missing one is treated as empty, which is the same
 * concession version 2 made for `tombstones` — importing a version 1 file
 * still resurrects anything deleted since it was written, and there is no
 * fixing that from this side.
 */
export const BACKUP_SCHEMA_VERSION = 3

/**
 * Renamed with the app, and this is the one that could not have been
 * undone later.
 *
 * It is the first thing checked when a file is opened, so a new magic
 * rejects every file written under the old one. Changing it once there
 * were backups worth having would have made the rename the single event
 * that invalidated all of them — precisely the moment somebody might
 * reach for one. Changed now, while every file carrying `lift.backup`
 * was written this week by a test.
 */
export const BACKUP_MAGIC = 'lifeos.backup'

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
  readonly workouts: number
  readonly checkIns: number
  readonly items: number
  readonly projects: number
  readonly upgrades: number
  readonly friends: number
  readonly metrics: number
  readonly reviews: number
  readonly places: number
  readonly trips: number
  /** Geohash cells of walked ground. Counted, though it is a set of ids. */
  readonly exploredCells: number
}

export interface BackupData {
  readonly settings: AppSettings
  readonly exercises: readonly Exercise[]
  readonly workouts: readonly WorkoutLog[]
  readonly checkIns: readonly CheckIn[]
  /**
   * What was deleted, so a merge does not undo it.
   *
   * Optional on read for version 1 files. Always written.
   */
  readonly tombstones?: readonly Tombstone[]

  /*
   * The absorbed areas. All optional on read: a version 1 or 2 file
   * predates them and a missing section means "none", never "delete what
   * is here".
   */
  readonly items?: readonly Item[]
  readonly projects?: readonly Project[]
  readonly upgrades?: readonly Upgrade[]
  readonly friends?: readonly Friend[]
  readonly metrics?: readonly MetricDefinition[]
  readonly reviews?: readonly MonthlySnapshot[]
  readonly places?: readonly Place[]
  readonly trips?: readonly Trip[]
  /**
   * Walked ground, as bare cell ids.
   *
   * A set rather than records, and it merges by union on the way back in
   * — the same reason it has no tombstone anywhere else in the hub. There
   * is no such thing as un-walking ground.
   */
  readonly exploredCells?: readonly string[]
}

export function countsFor(data: BackupData): BackupCounts {
  return {
    exercises: data.exercises.length,
    workouts: data.workouts.length,
    checkIns: data.checkIns.length,
    items: data.items?.length ?? 0,
    projects: data.projects?.length ?? 0,
    upgrades: data.upgrades?.length ?? 0,
    friends: data.friends?.length ?? 0,
    metrics: data.metrics?.length ?? 0,
    reviews: data.reviews?.length ?? 0,
    places: data.places?.length ?? 0,
    trips: data.trips?.length ?? 0,
    exploredCells: data.exploredCells?.length ?? 0,
  }
}

/** Every collection a backup carries, for anything that walks them all. */
export const BACKUP_COUNT_KEYS = [
  'exercises',
  'workouts',
  'checkIns',
  'items',
  'projects',
  'upgrades',
  'friends',
  'metrics',
  'reviews',
  'places',
  'trips',
  'exploredCells',
] as const satisfies readonly (keyof BackupCounts)[]

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

  for (const key of ['exercises', 'workouts', 'checkIns'] as const) {
    if (!Array.isArray(bag[key])) {
      problems.push({
        severity: 'error',
        message: `The backup's "${key}" section is missing or malformed.`,
      })
    }
  }

  /*
   * Absent is fine; present and wrong is not.
   *
   * Every version 1 file lacks this section, and refusing those would
   * make a schema bump a data-loss event for anyone holding an older
   * backup. A section that exists but is not a list is a different claim
   * — that is a corrupt file, and saying so is more useful than quietly
   * reading it as empty.
   */
  if (bag.tombstones !== undefined && !Array.isArray(bag.tombstones)) {
    problems.push({
      severity: 'error',
      message: `The backup's "tombstones" section is malformed.`,
    })
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
