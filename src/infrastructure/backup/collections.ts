import type { BackupCounts, BackupData } from '@/domain/backup/envelope'
import type {
  CheckInRepository,
  ExerciseRepository,
  TombstoneRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { TombstonedCollection } from '@/domain/sync/tombstone'

/**
 * One table describing every collection a backup carries.
 *
 * The alternative is what this replaced: three hand-written lists — one to
 * gather, one to count, one to restore — which agreed when there were
 * three collections and would not have agreed at twelve. A collection now
 * joins the backup by gaining a row here, and the export, the preview and
 * the import all walk the same row.
 *
 * The typing is deliberately loose *inside* each entry and exact at the
 * edges: every accessor is written against its own record type at the
 * point of definition, and the map erases that so callers can iterate.
 * The trade is one `unknown` in the middle against twelve places that
 * would otherwise have to be kept in step by hand.
 */

export interface BackupRepositories {
  readonly exercises: ExerciseRepository
  readonly workouts: WorkoutRepository
  readonly checkIns: CheckInRepository
  readonly tombstones: TombstoneRepository
}

/** The key a collection is filed under, in the file and in the counts. */
export type CollectionKey = keyof BackupCounts

interface Collection {
  /** What is on this device now. */
  readonly local: (repositories: BackupRepositories) => Promise<readonly unknown[]>
  /** What the file carries, empty when the file predates this collection. */
  readonly fromFile: (data: BackupData) => readonly unknown[]
  readonly idOf: (row: unknown) => string
  /**
   * Written without a change stamp, which is what makes it a *restore*
   * rather than an edit — a restored record must keep the stamp it was
   * exported with, or every import would look newer than every device.
   */
  readonly restore: (repositories: BackupRepositories, rows: readonly unknown[]) => Promise<void>
  /**
   * The collection name this device's tombstones are filed under, absent
   * when nothing can be deleted from it. Typed against the tombstone
   * module's own list, so a name that does not exist there is a compile
   * error rather than a filter that silently matches nothing.
   */
  readonly tombstoneCollection?: TombstonedCollection
  /**
   * Deletes a record without writing a tombstone — the receiving half of
   * a sync, where the tombstone has already arrived from the other
   * device. Present exactly when `tombstoneCollection` is: a collection
   * nothing can delete from has nothing to purge.
   */
  readonly purge?: (repositories: BackupRepositories, id: string) => Promise<void>
}

function define<T>(spec: {
  local: (repositories: BackupRepositories) => Promise<readonly T[]>
  fromFile: (data: BackupData) => readonly T[]
  idOf: (row: T) => string
  restore: (repositories: BackupRepositories, rows: readonly T[]) => Promise<void>
  tombstoneCollection?: TombstonedCollection
  purge?: (repositories: BackupRepositories, id: string) => Promise<void>
}): Collection {
  return {
    local: spec.local,
    fromFile: (data) => spec.fromFile(data),
    idOf: (row) => spec.idOf(row as T),
    restore: (repositories, rows) => spec.restore(repositories, rows as readonly T[]),
    ...(spec.tombstoneCollection === undefined
      ? {}
      : { tombstoneCollection: spec.tombstoneCollection }),
    ...(spec.purge === undefined ? {} : { purge: spec.purge }),
  }
}

export const COLLECTIONS: Readonly<Record<CollectionKey, Collection>> = {
  exercises: define({
    local: (r) => r.exercises.all(),
    fromFile: (data) => data.exercises,
    idOf: (row) => row.id,
    restore: (r, rows) => r.exercises.restoreMany(rows),
    tombstoneCollection: 'exercises',
    purge: (r, id) => r.exercises.purge(id as never),
  }),
  workouts: define({
    local: (r) => r.workouts.all(),
    fromFile: (data) => data.workouts,
    idOf: (row) => row.id,
    restore: (r, rows) => r.workouts.restoreMany(rows),
    tombstoneCollection: 'workouts',
    purge: (r, id) => r.workouts.purge(id as never),
  }),
  checkIns: define({
    local: (r) => r.checkIns.all(),
    fromFile: (data) => data.checkIns,
    idOf: (row) => row.id,
    restore: (r, rows) => r.checkIns.restoreMany(rows),
    tombstoneCollection: 'checkIns',
    purge: (r, id) => r.checkIns.purge(id as never),
  }),
}

export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as readonly CollectionKey[]
