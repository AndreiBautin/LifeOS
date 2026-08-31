import type { BackupCounts, BackupData } from '@/domain/backup/envelope'
import type {
  BacklogItemRepository,
  CheckInRepository,
  ExerciseRepository,
  ExploredAreaRepository,
  FriendRepository,
  PlaceRepository,
  ProjectRepository,
  ReviewRepository,
  TombstoneRepository,
  TripRepository,
  DailyRepository,
  UpgradeRepository,
  ViceRepository,
  AttemptRepository,
  HomeRepository,
  CampaignRepository,
  FinanceRepository,
  ResumeRepository,
  WeighInRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { CellId } from '@/domain/atlas/exploration/GeoCell'
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
  readonly items: BacklogItemRepository
  readonly projects: ProjectRepository
  readonly upgrades: UpgradeRepository
  readonly friends: FriendRepository
  readonly review: ReviewRepository
  readonly places: PlaceRepository
  readonly trips: TripRepository
  readonly dailies: DailyRepository
  readonly vices: ViceRepository
  readonly weighIns: WeighInRepository
  readonly finance: FinanceRepository
  readonly campaigns: CampaignRepository
  readonly attempts: AttemptRepository
  readonly homes: HomeRepository
  readonly resume: ResumeRepository
  readonly explored: ExploredAreaRepository
}

/** The key a collection is filed under, in the file and in the counts. */
export type CollectionKey = Exclude<keyof BackupCounts, 'exploredCells'>

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
}

function define<T>(spec: {
  local: (repositories: BackupRepositories) => Promise<readonly T[]>
  fromFile: (data: BackupData) => readonly T[]
  idOf: (row: T) => string
  restore: (repositories: BackupRepositories, rows: readonly T[]) => Promise<void>
  tombstoneCollection?: TombstonedCollection
}): Collection {
  return {
    local: spec.local,
    fromFile: (data) => spec.fromFile(data),
    idOf: (row) => spec.idOf(row as T),
    restore: (repositories, rows) => spec.restore(repositories, rows as readonly T[]),
    ...(spec.tombstoneCollection === undefined
      ? {}
      : { tombstoneCollection: spec.tombstoneCollection }),
  }
}

export const COLLECTIONS: Readonly<Record<CollectionKey, Collection>> = {
  exercises: define({
    local: (r) => r.exercises.all(),
    fromFile: (data) => data.exercises,
    idOf: (row) => row.id,
    restore: (r, rows) => r.exercises.restoreMany(rows),
    tombstoneCollection: 'exercises',
  }),
  workouts: define({
    local: (r) => r.workouts.all(),
    fromFile: (data) => data.workouts,
    idOf: (row) => row.id,
    restore: (r, rows) => r.workouts.restoreMany(rows),
    tombstoneCollection: 'workouts',
  }),
  checkIns: define({
    local: (r) => r.checkIns.all(),
    fromFile: (data) => data.checkIns,
    idOf: (row) => row.id,
    restore: (r, rows) => r.checkIns.restoreMany(rows),
    tombstoneCollection: 'checkIns',
  }),
  items: define({
    local: (r) => r.items.all(),
    fromFile: (data) => data.items ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.items.restoreMany(rows),
    tombstoneCollection: 'items',
  }),
  projects: define({
    local: (r) => r.projects.all(),
    fromFile: (data) => data.projects ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.projects.restoreMany(rows),
    tombstoneCollection: 'projects',
  }),
  upgrades: define({
    local: (r) => r.upgrades.all(),
    fromFile: (data) => data.upgrades ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.upgrades.restoreMany(rows),
    tombstoneCollection: 'upgrades',
  }),
  friends: define({
    local: (r) => r.friends.all(),
    fromFile: (data) => data.friends ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.friends.restoreMany(rows),
    tombstoneCollection: 'friends',
  }),
  metrics: define({
    local: (r) => r.review.metrics(),
    fromFile: (data) => data.metrics ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.review.restoreMetrics(rows),
    // Metric definitions are retired rather than deleted, so nothing files
    // a tombstone against them.
  }),
  reviews: define({
    local: (r) => r.review.snapshots(),
    fromFile: (data) => data.reviews ?? [],
    // A snapshot is one month, and the month is its identity.
    idOf: (row) => row.month,
    restore: (r, rows) => r.review.restoreSnapshots(rows),
    tombstoneCollection: 'reviews',
  }),
  places: define({
    local: (r) => r.places.all(),
    fromFile: (data) => data.places ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.places.restoreMany(rows),
    tombstoneCollection: 'places',
  }),
  trips: define({
    local: (r) => r.trips.all(),
    fromFile: (data) => data.trips ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.trips.restoreMany(rows),
    tombstoneCollection: 'trips',
  }),
  dailies: define({
    local: (r) => r.dailies.all(),
    fromFile: (data) => data.dailies ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.dailies.restoreMany(rows),
    tombstoneCollection: 'dailies',
  }),
  vices: define({
    local: (r) => r.vices.all(),
    fromFile: (data) => data.vices ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.vices.restoreMany(rows),
    tombstoneCollection: 'vices',
  }),
  /*
   * Both keyed by the day rather than by a generated id, so `idOf` reads
   * `day`. That is not a quirk of the backup — it is the same key the
   * store uses, and it is what makes re-importing a file idempotent
   * instead of duplicating every morning you ever weighed yourself.
   */
  finance: define({
    local: (r) => r.finance.all(),
    fromFile: (data) => data.finance ?? [],
    idOf: (row) => row.month,
    restore: (r, rows) => r.finance.restoreMany(rows),
    tombstoneCollection: 'finance',
  }),
  /*
   * A collection of nought or one, because there is one resume.
   *
   * It fits the table awkwardly and belongs in it anyway — the whole
   * claim this module makes is that a thing joins the export, the
   * preview and the import by gaining a row here, and the alternative
   * was a fourth hand-written path for a single record. It carries no
   * tombstone: a resume is edited down to nothing, never deleted.
   *
   * The id is fixed, because the record has none. That is also what
   * makes a restore an overwrite rather than an accumulation.
   */
  resume: define({
    local: async (r) => {
      const resume = await r.resume.get()
      return resume === undefined ? [] : [resume]
    },
    fromFile: (data) => data.resume ?? [],
    idOf: () => 'current',
    restore: async (r, rows) => {
      const incoming = rows[0]
      if (incoming !== undefined) await r.resume.save(incoming)
    },
  }),
  homes: define({
    local: (r) => r.homes.all(),
    fromFile: (data) => data.homes ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.homes.restoreMany(rows),
    tombstoneCollection: 'homes',
  }),
  attempts: define({
    local: (r) => r.attempts.all(),
    fromFile: (data) => data.attempts ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.attempts.restoreMany(rows),
    tombstoneCollection: 'attempts',
  }),
  campaigns: define({
    local: (r) => r.campaigns.all(),
    fromFile: (data) => data.campaigns ?? [],
    idOf: (row) => row.id,
    restore: (r, rows) => r.campaigns.restoreMany(rows),
    tombstoneCollection: 'campaigns',
  }),
  weighIns: define({
    local: (r) => r.weighIns.all(),
    fromFile: (data) => data.weighIns ?? [],
    idOf: (row) => row.day,
    restore: (r, rows) => r.weighIns.restoreMany(rows),
    tombstoneCollection: 'weighIns',
  }),
}

export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as readonly CollectionKey[]

/**
 * Walked ground, handled apart from the table above.
 *
 * It is a set of bare ids rather than records: no id field to read, no
 * tombstone to check, and it merges by union because there is no such
 * thing as un-walking ground. Every assumption the table makes is one this
 * breaks, which is why it is not in it.
 */
export async function localCells(repositories: BackupRepositories): Promise<ReadonlySet<CellId>> {
  return repositories.explored.all()
}

export async function restoreCells(
  repositories: BackupRepositories,
  cells: readonly string[],
): Promise<void> {
  if (cells.length === 0) return
  await repositories.explored.reveal(cells as readonly CellId[])
}
