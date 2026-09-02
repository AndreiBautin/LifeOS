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
import type { Tombstone } from '@/domain/sync/tombstone'
import { indexTombstones, shouldAccept } from '@/domain/sync/tombstone'
import {
  COLLECTIONS,
  COLLECTION_KEYS,
  localCells,
  restoreCells,
  type BackupRepositories,
  type CollectionKey,
} from './collections'

export type { BackupRepositories } from './collections'

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

export interface ExportOptions {
  readonly settings: AppSettings
  readonly appVersion: string
  readonly now: Date
}

export async function buildBackup(
  repositories: BackupRepositories,
  options: ExportOptions,
): Promise<BackupEnvelope> {
  const [gathered, tombstones, cells] = await Promise.all([
    Promise.all(COLLECTION_KEYS.map((key) => COLLECTIONS[key].local(repositories))),
    repositories.tombstones.all(),
    localCells(repositories),
  ])

  const sections = Object.fromEntries(
    COLLECTION_KEYS.map((key, index) => [key, gathered[index] ?? []]),
  ) as unknown as Omit<BackupData, 'settings' | 'tombstones' | 'exploredCells'>

  const data: BackupData = {
    ...sections,
    settings: options.settings,
    tombstones,
    // Sorted so two exports of the same ground produce the same file,
    // which is what makes a checksum worth having.
    exploredCells: [...cells].sort(),
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
  return `lifeos-backup-${stamp}.json`
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
  const localTombstones = await repositories.tombstones.all()

  // Counted the way it will be applied, or the preview is a different
  // answer to the one the button gives.
  const accepted = acceptable(envelope, localTombstones)

  const added = emptyCounts()
  const updated = emptyCounts()
  const unchanged = emptyCounts()

  await Promise.all(
    COLLECTION_KEYS.map(async (key) => {
      const collection = COLLECTIONS[key]
      const existing = new Set((await collection.local(repositories)).map(collection.idOf))

      for (const row of accepted[key]) {
        if (existing.has(collection.idOf(row))) updated[key] += 1
        else added[key] += 1
      }

      unchanged[key] = existing.size - updated[key]
    }),
  )

  /*
   * Ground merges by union, so nothing is ever updated and nothing is
   * ever lost: a cell in the file is either new here or already walked.
   */
  const cells = await localCells(repositories)
  const incoming = envelope.data.exploredCells ?? []
  added.exploredCells = incoming.filter((cell) => !cells.has(cell as never)).length
  unchanged.exploredCells = cells.size

  return { added, updated, unchanged }
}

function emptyCounts(): Record<keyof BackupCounts, number> {
  return {
    exercises: 0,
    workouts: 0,
    checkIns: 0,
    items: 0,
    projects: 0,
    upgrades: 0,
    friends: 0,
    metrics: 0,
    reviews: 0,
    vices: 0,
    resume: 0,
    campaigns: 0,
    attempts: 0,
    challenges: 0,
    homes: 0,
    rooms: 0,
    finance: 0,
    places: 0,
    trips: 0,
    dailies: 0,
    exploredCells: 0,
  }
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

  for (const key of COLLECTION_KEYS) {
    await COLLECTIONS[key].restore(repositories, accepted[key])
  }

  // Union, always. Ground has no tombstone because there is no such thing
  // as un-walking it, so an import can only ever add.
  await restoreCells(repositories, data.exploredCells ?? [])

  return {
    imported: {
      ...countsFor({ ...data, ...toSections(accepted) }),
      exploredCells: (data.exploredCells ?? []).length,
    },
    // Settings are only adopted on a full replace. Merging someone else's
    // training maxes into a live setup would silently rewrite every
    // percentage the program prescribes.
    ...(mode === 'replace' ? { settings: data.settings } : {}),
  }
}

type Accepted = Readonly<Record<CollectionKey, readonly unknown[]>>

function toSections(accepted: Accepted): Partial<BackupData> {
  return Object.fromEntries(COLLECTION_KEYS.map((key) => [key, accepted[key]]))
}

/**
 * The subset of a backup that survives this device's deletions.
 *
 * Shared by the preview and the apply so the count shown on the button is
 * the count the button produces. They were separate walks over the same
 * data once, which is exactly the shape of thing that drifts.
 */
function acceptable(envelope: BackupEnvelope, localTombstones: readonly Tombstone[]): Accepted {
  const index = indexTombstones(localTombstones)
  const { data } = envelope

  return Object.fromEntries(
    COLLECTION_KEYS.map((key) => {
      const collection = COLLECTIONS[key]
      const rows = collection.fromFile(data)
      const name = collection.tombstoneCollection

      return [
        key,
        // A collection nothing can delete from has nothing to veto its
        // rows, so every row is accepted rather than checked against a
        // tombstone that could never exist.
        name === undefined
          ? rows
          : rows.filter((row) =>
              // `shouldAccept` only reads `updatedAt`, and the table has
              // already erased each row's type — asserting the one field
              // it looks at is narrower than asserting the record.
              shouldAccept(
                row as { readonly updatedAt?: string },
                name,
                collection.idOf(row),
                index,
              ),
            ),
      ]
    }),
  ) as Accepted
}
