import type { Room } from '@/domain/base/declutter'
import type { HomeCandidate } from '@/domain/homes/candidate'
import type { Attempt } from '@/domain/mind/practice'
import type { ChallengeMark } from '@/domain/challenges/challenge'
import type { Campaign } from '@/domain/campaign/campaign'
import type { AttemptId, CampaignId, HomeCandidateId, RoomId } from '@/domain/ids/ids'
import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { FinanceReading } from '@/domain/finance/reading'
import type { Resume } from '@/domain/resume/resume'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Place } from '@/domain/atlas/place/Place'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { Daily } from '@/domain/dailies/daily'
import type { Vice } from '@/domain/vitals/charges'
import type { TripId } from '@/domain/atlas/trip/TripId'
import type { CellId } from '@/domain/atlas/exploration/GeoCell'
import type { ProgramPosition } from '@/domain/programs/position'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { resolveLibrary } from '@/domain/exercises/library'
import type {
  BacklogItemId,
  CheckInId,
  DailyId,
  ExerciseId,
  FriendId,
  MetricId,
  ProjectId,
  UpgradeId,
  ViceId,
  WorkoutId,
} from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  BacklogItemRepository,
  CheckInRepository,
  Clock,
  DailyRepository,
  ExerciseRepository,
  FinanceRepository,
  AttemptRepository,
  ChallengeRepository,
  HomeRepository,
  RoomRepository,
  CampaignRepository,
  ResumeRepository,
  ExploredAreaRepository,
  FriendRepository,
  PlaceRepository,
  PositionRepository,
  ProjectRepository,
  ReviewRepository,
  TombstoneRepository,
  TripRepository,
  UpgradeRepository,
  ViceRepository,
  WorkoutQuery,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { Tombstone, TombstonedCollection } from '@/domain/sync/tombstone'
import { tombstoneKey } from '@/domain/sync/tombstone'

import { fromStored, toStored, type AppDatabase, type StoredDaily } from './database'
import { HYGIENE_GROUP, LEGACY_HYGIENE_GROUP } from '@/domain/dailies/groups'

/**
 * IndexedDB implementations of the domain's repository ports.
 *
 * Thin by design: each method is one store or index operation. Anything
 * that needs a decision made about it belongs in a use-case, not here —
 * a repository that starts computing is a repository that cannot be
 * swapped for an in-memory double in a test.
 */

/**
 * Stamping and tombstoning, in one place each.
 *
 * Both are the kind of bookkeeping that is a guarantee when the storage
 * layer does it and a habit when call sites are asked to. There are five
 * paths that write a workout and three that write an exercise; a rule
 * living in any of them is a rule that will be missed by the sixth.
 */
function stamp<T>(record: T, clock: Clock): T & { readonly updatedAt: string } {
  return { ...record, updatedAt: clock.now().toISOString() }
}

async function bury(
  db: AppDatabase,
  clock: Clock,
  collection: TombstonedCollection,
  id: string,
): Promise<void> {
  const tombstone: Tombstone = { id, collection, deletedAt: clock.now().toISOString() }
  await db.put('tombstones', tombstone, tombstoneKey(collection, id))
}

/**
 * What has been deleted. See `domain/sync/tombstone.ts`.
 */
export function createTombstoneRepository(db: AppDatabase): TombstoneRepository {
  return {
    async all() {
      return db.getAll('tombstones')
    },
    async since(deletedAt: string) {
      return db.getAllFromIndex('tombstones', 'by-deleted', IDBKeyRange.lowerBound(deletedAt, true))
    },
    async record(tombstones: readonly Tombstone[]) {
      const tx = db.transaction('tombstones', 'readwrite')
      await Promise.all([
        ...tombstones.map((tombstone) =>
          tx.store.put(tombstone, tombstoneKey(tombstone.collection, tombstone.id)),
        ),
        tx.done,
      ])
    },
  }
}

/**
 * The exercise library: the shipped catalogue, plus whatever the store
 * holds that the catalogue cannot know about.
 *
 * The one repository here that is not a straight pass-through, and the
 * exception is deliberate — see {@link resolveLibrary}. Reading the
 * catalogue at every use is what removed three delivery mechanisms that
 * between them still could not deliver an edit to an exercise that
 * already existed.
 */
export function createExerciseRepository(db: AppDatabase, clock: Clock): ExerciseRepository {
  return {
    async all() {
      return resolveLibrary(builtInExercises(), await db.getAll('exercises'))
    },
    async byId(id: ExerciseId) {
      const library = await this.all()
      return library.find((exercise) => exercise.id === id)
    },
    async save(exercise: Exercise) {
      await db.put('exercises', stamp(exercise, clock))
    },
    async restoreMany(exercises: readonly Exercise[]) {
      const tx = db.transaction('exercises', 'readwrite')
      await Promise.all([...exercises.map((exercise) => tx.store.put(exercise)), tx.done])
    },
    async remove(id: ExerciseId) {
      await db.delete('exercises', id)
      await bury(db, clock, 'exercises', id)
    },
    async purge(id: ExerciseId) {
      await db.delete('exercises', id)
    },
    async count() {
      return (await this.all()).length
    },
  }
}

/**
 * Where the lifter is, under one fixed key.
 *
 * A single-record store rather than a keyed collection, because there is
 * exactly one position and never a list of them. Modelling it as a
 * collection is what invited a library in the first place.
 */
const POSITION_KEY = 'current'

export function createPositionRepository(db: AppDatabase): PositionRepository {
  return {
    async get() {
      return db.get('position', POSITION_KEY)
    },
    async save(position: ProgramPosition) {
      await db.put('position', position, POSITION_KEY)
    },
    async clear() {
      await db.delete('position', POSITION_KEY)
    },
  }
}

export function createWorkoutRepository(db: AppDatabase, clock: Clock): WorkoutRepository {
  const newestFirst = (a: WorkoutLog, b: WorkoutLog): number => b.date.localeCompare(a.date)

  return {
    async byId(id: WorkoutId) {
      const stored = await db.get('workouts', id)
      return stored === undefined ? undefined : fromStored(stored)
    },

    async recent(limit: number) {
      // Walks the date index backwards and stops at `limit`, rather than
      // loading every workout and slicing. The difference does not matter
      // at fifty workouts and matters a great deal at five thousand.
      const results: WorkoutLog[] = []
      let cursor = await db.transaction('workouts').store.index('by-date').openCursor(null, 'prev')

      while (cursor !== null && results.length < limit) {
        results.push(fromStored(cursor.value))
        cursor = await cursor.continue()
      }

      return results
    },

    async inRange(query: WorkoutQuery) {
      const range =
        query.from !== undefined && query.to !== undefined
          ? IDBKeyRange.bound(query.from, query.to)
          : query.from !== undefined
            ? IDBKeyRange.lowerBound(query.from)
            : query.to !== undefined
              ? IDBKeyRange.upperBound(query.to)
              : null

      const all = (await db.getAllFromIndex('workouts', 'by-date', range)).map(fromStored)
      const ordered = all.sort(newestFirst)
      return query.limit === undefined ? ordered : ordered.slice(0, query.limit)
    },

    async onDate(date: string) {
      return (await db.getAllFromIndex('workouts', 'by-date', date)).map(fromStored)
    },

    async forExercise(exerciseId: ExerciseId, limit?: number) {
      const matches = (await db.getAllFromIndex('workouts', 'by-exercise', exerciseId)).map(
        fromStored,
      )
      const ordered = matches.sort(newestFirst)
      return limit === undefined ? ordered : ordered.slice(0, limit)
    },

    async inProgress() {
      const open = await db.getAllFromIndex('workouts', 'by-status', 'in-progress')
      const newest = open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
      return newest === undefined ? undefined : fromStored(newest)
    },

    async save(log: WorkoutLog) {
      // The index field is derived here and nowhere else, so it cannot
      // drift from the entries it summarises.
      await db.put('workouts', toStored(stamp(log, clock)))
    },

    async restoreMany(logs: readonly WorkoutLog[]) {
      const tx = db.transaction('workouts', 'readwrite')
      await Promise.all([...logs.map((log) => tx.store.put(toStored(log))), tx.done])
    },

    async remove(id: WorkoutId) {
      await db.delete('workouts', id)
      await bury(db, clock, 'workouts', id)
    },

    async purge(id: WorkoutId) {
      await db.delete('workouts', id)
    },

    async count() {
      return db.count('workouts')
    },

    async all() {
      return (await db.getAll('workouts')).map(fromStored)
    },
  }
}

/**
 * The backlog.
 *
 * `replaceAll` did not come across. It rewrote the whole collection in one
 * call, which is what localStorage forces and IndexedDB does not — and it
 * put a destructive operation and a restore behind one name, so a call
 * site asking to fill an empty store could receive a wipe. It is
 * `restoreMany` and `clear` here, and the import path is the only caller
 * of the second.
 */
export function createBacklogItemRepository(db: AppDatabase, clock: Clock): BacklogItemRepository {
  return {
    async all() {
      return db.getAll('items')
    },
    async byId(id: BacklogItemId) {
      return db.get('items', id)
    },
    async save(item: Item) {
      await db.put('items', stamp(item, clock))
    },
    async restoreMany(items: readonly Item[]) {
      const tx = db.transaction('items', 'readwrite')
      await Promise.all([...items.map((item) => tx.store.put(item)), tx.done])
    },
    async remove(id: BacklogItemId) {
      await db.delete('items', id)
      await bury(db, clock, 'items', id)
    },
    async purge(id: BacklogItemId) {
      await db.delete('items', id)
    },
    async clear() {
      await db.clear('items')
    },
    async count() {
      return db.count('items')
    },
  }
}

/**
 * The quest log.
 *
 * `saveMany` exists because completing one project can un-block others,
 * and those have to land with it — a partial write leaves the graph saying
 * a project is blocked by something already finished. One transaction, and
 * every record in it stamped, which is what separates it from
 * `restoreMany`.
 */
export function createProjectRepository(db: AppDatabase, clock: Clock): ProjectRepository {
  return {
    async all() {
      return db.getAll('projects')
    },
    async byId(id: ProjectId) {
      return db.get('projects', id)
    },
    async save(project: Project) {
      await db.put('projects', stamp(project, clock))
    },
    async saveMany(projects: readonly Project[]) {
      const tx = db.transaction('projects', 'readwrite')
      await Promise.all([
        ...projects.map((project) => tx.store.put(stamp(project, clock))),
        tx.done,
      ])
    },
    async restoreMany(projects: readonly Project[]) {
      const tx = db.transaction('projects', 'readwrite')
      await Promise.all([...projects.map((project) => tx.store.put(project)), tx.done])
    },
    async remove(id: ProjectId) {
      await db.delete('projects', id)
      await bury(db, clock, 'projects', id)
    },
    async purge(id: ProjectId) {
      await db.delete('projects', id)
    },
    async clear() {
      await db.clear('projects')
    },
    async count() {
      return db.count('projects')
    },
  }
}

/**
 * The tech tree.
 *
 * No batch write, unlike projects: buying something changes no other
 * record, because what it unblocks is derived from the graph on every
 * read rather than stored on the nodes.
 */
export function createUpgradeRepository(db: AppDatabase, clock: Clock): UpgradeRepository {
  return {
    async all() {
      return db.getAll('upgrades')
    },
    async byId(id: UpgradeId) {
      return db.get('upgrades', id)
    },
    async save(upgrade: Upgrade) {
      await db.put('upgrades', stamp(upgrade, clock))
    },
    async restoreMany(upgrades: readonly Upgrade[]) {
      const tx = db.transaction('upgrades', 'readwrite')
      await Promise.all([...upgrades.map((upgrade) => tx.store.put(upgrade)), tx.done])
    },
    async remove(id: UpgradeId) {
      await db.delete('upgrades', id)
      await bury(db, clock, 'upgrades', id)
    },
    async purge(id: UpgradeId) {
      await db.delete('upgrades', id)
    },
    async clear() {
      await db.clear('upgrades')
    },
    async count() {
      return db.count('upgrades')
    },
  }
}

export function createFriendRepository(db: AppDatabase, clock: Clock): FriendRepository {
  return {
    async all() {
      return db.getAll('friends')
    },
    async byId(id: FriendId) {
      return db.get('friends', id)
    },
    async save(friend: Friend) {
      await db.put('friends', stamp(friend, clock))
    },
    async restoreMany(friends: readonly Friend[]) {
      const tx = db.transaction('friends', 'readwrite')
      await Promise.all([...friends.map((friend) => tx.store.put(friend)), tx.done])
    },
    async remove(id: FriendId) {
      await db.delete('friends', id)
      await bury(db, clock, 'friends', id)
    },
    async purge(id: FriendId) {
      await db.delete('friends', id)
    },
    async count() {
      return db.count('friends')
    },
  }
}

/**
 * Hand-defined metrics, and the months.
 *
 * A snapshot's key is its month, which is what makes "one review per
 * month" structural rather than a rule somebody has to check. Its
 * tombstone is keyed on the month for the same reason — there is no other
 * identity to delete.
 */
export function createReviewRepository(db: AppDatabase, clock: Clock): ReviewRepository {
  return {
    async metrics() {
      return db.getAll('metrics')
    },
    async saveMetric(metric: MetricDefinition) {
      await db.put('metrics', stamp(metric, clock))
    },
    async removeMetric(id: MetricId) {
      await db.delete('metrics', id)
    },
    async restoreMetrics(metrics: readonly MetricDefinition[]) {
      const tx = db.transaction('metrics', 'readwrite')
      await Promise.all([...metrics.map((metric) => tx.store.put(metric)), tx.done])
    },

    async snapshots() {
      return db.getAll('reviews')
    },
    async snapshot(month: string) {
      return db.get('reviews', month)
    },
    async saveSnapshot(snapshot: MonthlySnapshot) {
      await db.put('reviews', stamp(snapshot, clock))
    },
    async restoreSnapshots(snapshots: readonly MonthlySnapshot[]) {
      const tx = db.transaction('reviews', 'readwrite')
      await Promise.all([...snapshots.map((snapshot) => tx.store.put(snapshot)), tx.done])
    },
    async removeSnapshot(month: string) {
      await db.delete('reviews', month)
      await bury(db, clock, 'reviews', month)
    },
    async purgeSnapshot(month: string) {
      await db.delete('reviews', month)
    },
  }
}

export function createPlaceRepository(db: AppDatabase, clock: Clock): PlaceRepository {
  return {
    async all() {
      return db.getAll('places')
    },
    async byId(id: PlaceId) {
      return db.get('places', id)
    },
    async save(place: Place) {
      await db.put('places', stamp(place, clock))
    },
    async restoreMany(places: readonly Place[]) {
      const tx = db.transaction('places', 'readwrite')
      await Promise.all([...places.map((place) => tx.store.put(place)), tx.done])
    },
    async remove(id: PlaceId) {
      await db.delete('places', id)
      await bury(db, clock, 'places', id)
    },
    async purge(id: PlaceId) {
      await db.delete('places', id)
    },
    async count() {
      return db.count('places')
    },
  }
}

/**
 * A stored habit, read as this build understands homes and group names.
 *
 * Two derivations, one shape, and the second is why they had to be
 * separated. Upkeep was `belongsTo: 'vitals'` and became a **group**; a
 * row written by the old build matches no `RecordHome` and is not
 * own-area either, so without the first it would be filtered off every
 * screen while sitting in the database — the worst kind of loss, because
 * nothing errors and the record is still there.
 *
 * The group itself was then renamed from *Upkeep* to *Hygiene*, so the
 * second maps that name whatever a row's home is. Applying it only to
 * legacy rows would leave a device holding both names at once, drawn as
 * two categories — the split this rename exists to avoid.
 *
 * **A derivation, not a migration.** Nothing is rewritten on read; the
 * row normalises the next time something saves it, since callers hand
 * back what they were given, and ticking a habit saves it. That is the
 * rule `shelfOf` follows for an upgrade with no shelf, and it is what
 * keeps this safe across sync: a device still on the old build goes on
 * reading its own copy the way it always did.
 *
 * An existing `group` wins over the legacy home. Somebody who had
 * already labelled a chore meant that label, and overwriting it here
 * would be this function having an opinion about their filing — which
 * the rename above then does exactly once, deliberately, for one name.
 */
export function fromStoredDaily(stored: StoredDaily): Daily {
  const renamed =
    stored.group === LEGACY_HYGIENE_GROUP ? { ...stored, group: HYGIENE_GROUP } : stored

  if (renamed.belongsTo !== LEGACY_UPKEEP_HOME) return renamed as Daily

  const { belongsTo: _retired, ...rest } = renamed

  return { ...rest, group: renamed.group ?? HYGIENE_GROUP }
}

/** The home hygiene habits were filed under before it became a label. */
const LEGACY_UPKEEP_HOME = 'vitals'

export function createDailyRepository(db: AppDatabase, clock: Clock): DailyRepository {
  return {
    async all() {
      return (await db.getAll('dailies')).map(fromStoredDaily)
    },
    async byId(id: DailyId) {
      const stored = await db.get('dailies', id)
      return stored === undefined ? undefined : fromStoredDaily(stored)
    },
    async save(daily: Daily) {
      await db.put('dailies', stamp(daily, clock))
    },
    async restoreMany(dailies: readonly Daily[]) {
      const tx = db.transaction('dailies', 'readwrite')
      await Promise.all([...dailies.map((daily) => tx.store.put(daily)), tx.done])
    },
    async remove(id: DailyId) {
      await db.delete('dailies', id)
      await bury(db, clock, 'dailies', id)
    },
    async purge(id: DailyId) {
      await db.delete('dailies', id)
    },
  }
}

export function createViceRepository(db: AppDatabase, clock: Clock): ViceRepository {
  return {
    async all() {
      return db.getAll('vices')
    },
    async byId(id: ViceId) {
      return db.get('vices', id)
    },
    async save(vice: Vice) {
      await db.put('vices', stamp(vice, clock))
    },
    async restoreMany(vices: readonly Vice[]) {
      const tx = db.transaction('vices', 'readwrite')
      await Promise.all([...vices.map((vice) => tx.store.put(vice)), tx.done])
    },
    async remove(id: ViceId) {
      await db.delete('vices', id)
      await bury(db, clock, 'vices', id)
    },
    async purge(id: ViceId) {
      await db.delete('vices', id)
    },
  }
}

export function createFinanceRepository(db: AppDatabase, clock: Clock): FinanceRepository {
  return {
    async all() {
      return db.getAll('finance')
    },
    async save(reading: FinanceReading) {
      await db.put('finance', stamp(reading, clock))
    },
    async restoreMany(readings: readonly FinanceReading[]) {
      const tx = db.transaction('finance', 'readwrite')
      await Promise.all([...readings.map((reading) => tx.store.put(reading)), tx.done])
    },
    async remove(month: string) {
      await db.delete('finance', month)
      await bury(db, clock, 'finance', month)
    },
    async purge(month: string) {
      await db.delete('finance', month)
    },
  }
}

/** The single key the one resume lives under. */
const RESUME_KEY = 'resume'

export function createResumeRepository(db: AppDatabase, clock: Clock): ResumeRepository {
  return {
    async get() {
      return db.get('resume', RESUME_KEY)
    },
    async save(resume: Resume) {
      await db.put('resume', stamp(resume, clock), RESUME_KEY)
    },
  }
}

export function createTripRepository(db: AppDatabase, clock: Clock): TripRepository {
  return {
    async all() {
      return db.getAll('trips')
    },
    async byId(id: TripId) {
      return db.get('trips', id)
    },
    async save(trip: Trip) {
      await db.put('trips', stamp(trip, clock))
    },
    async restoreMany(trips: readonly Trip[]) {
      const tx = db.transaction('trips', 'readwrite')
      await Promise.all([...trips.map((trip) => tx.store.put(trip)), tx.done])
    },
    async remove(id: TripId) {
      await db.delete('trips', id)
      await bury(db, clock, 'trips', id)
    },
    async purge(id: TripId) {
      await db.delete('trips', id)
    },
  }
}

/**
 * Ground you have walked.
 *
 * No stamping and no tombstones, and both absences are the point. There is
 * nothing to order — a cell is either revealed or it is not, and two
 * devices merge by union — and nothing to delete, because you cannot
 * un-walk ground.
 *
 * `reveal` reports how many were genuinely new so a caller can skip a
 * write and a re-render when a reading lands in a cell already cleared,
 * which on a walk is most readings.
 */
export function createExploredAreaRepository(db: AppDatabase): ExploredAreaRepository {
  return {
    async all() {
      return new Set((await db.getAllKeys('exploredCells')) as CellId[])
    },
    async reveal(cells: readonly CellId[]) {
      const known = await this.all()
      const fresh = cells.filter((cell) => !known.has(cell))
      if (fresh.length === 0) return 0

      const tx = db.transaction('exploredCells', 'readwrite')
      await Promise.all([...fresh.map((id) => tx.store.put({ id })), tx.done])
      return fresh.length
    },
    async clear() {
      await db.clear('exploredCells')
    },
    async count() {
      return db.count('exploredCells')
    },
  }
}

export function createCheckInRepository(db: AppDatabase, clock: Clock): CheckInRepository {
  return {
    async byId(id: CheckInId) {
      return db.get('checkIns', id)
    },
    async forWorkout(workoutId: WorkoutId) {
      return db.getAllFromIndex('checkIns', 'by-workout', workoutId)
    },
    async recent(limit: number) {
      const results: CheckIn[] = []
      let cursor = await db
        .transaction('checkIns')
        .store.index('by-recorded')
        .openCursor(null, 'prev')

      while (cursor !== null && results.length < limit) {
        results.push(cursor.value)
        cursor = await cursor.continue()
      }

      return results
    },
    async save(checkIn: CheckIn) {
      await db.put('checkIns', stamp(checkIn, clock))
    },
    async restoreMany(checkIns: readonly CheckIn[]) {
      const tx = db.transaction('checkIns', 'readwrite')
      await Promise.all([...checkIns.map((checkIn) => tx.store.put(checkIn)), tx.done])
    },
    async remove(id: CheckInId) {
      await db.delete('checkIns', id)
      await bury(db, clock, 'checkIns', id)
    },
    async purge(id: CheckInId) {
      await db.delete('checkIns', id)
    },
    async all() {
      return db.getAll('checkIns')
    },
  }
}

/**
 * The long arcs, one row each.
 *
 * Stages live inline on the campaign rather than in a store of their
 * own. A stage has no meaning apart from the arc it belongs to, nothing
 * queries them independently, and splitting them would turn every read
 * into a join and every write into a transaction — for a record that
 * holds six rows.
 */
export function createCampaignRepository(db: AppDatabase, clock: Clock): CampaignRepository {
  return {
    async all() {
      return db.getAll('campaigns')
    },
    async byId(id: CampaignId) {
      return db.get('campaigns', id)
    },
    async save(campaign: Campaign) {
      await db.put('campaigns', stamp(campaign, clock))
    },
    async restoreMany(campaigns: readonly Campaign[]) {
      const tx = db.transaction('campaigns', 'readwrite')
      await Promise.all([...campaigns.map((one) => tx.store.put(one)), tx.done])
    },
    async remove(id: CampaignId) {
      await db.delete('campaigns', id)
      await bury(db, clock, 'campaigns', id)
    },
    async purge(id: CampaignId) {
      await db.delete('campaigns', id)
    },
  }
}

/** Problems practised, one row each. */
export function createAttemptRepository(db: AppDatabase, clock: Clock): AttemptRepository {
  return {
    async all() {
      return db.getAll('attempts')
    },
    async byId(id: AttemptId) {
      return db.get('attempts', id)
    },
    async save(attempt: Attempt) {
      await db.put('attempts', stamp(attempt, clock))
    },
    async restoreMany(attempts: readonly Attempt[]) {
      const tx = db.transaction('attempts', 'readwrite')
      await Promise.all([...attempts.map((one) => tx.store.put(one)), tx.done])
    },
    async remove(id: AttemptId) {
      await db.delete('attempts', id)
      await bury(db, clock, 'attempts', id)
    },
    async purge(id: AttemptId) {
      await db.delete('attempts', id)
    },
  }
}

/** Seasonal challenge marks -- completions, removals, and your own. */
export function createChallengeRepository(db: AppDatabase, clock: Clock): ChallengeRepository {
  return {
    async all() {
      return db.getAll('challenges')
    },
    async save(mark: ChallengeMark) {
      await db.put('challenges', stamp(mark, clock))
    },
    async restoreMany(marks: readonly ChallengeMark[]) {
      const tx = db.transaction('challenges', 'readwrite')
      await Promise.all([...marks.map((one) => tx.store.put(one)), tx.done])
    },
    async remove(id: string) {
      await db.delete('challenges', id)
      await bury(db, clock, 'challenges', id)
    },
    async purge(id: string) {
      await db.delete('challenges', id)
    },
  }
}

/** Houses being considered. */
export function createHomeRepository(db: AppDatabase, clock: Clock): HomeRepository {
  return {
    async all() {
      return db.getAll('homes')
    },
    async byId(id: HomeCandidateId) {
      return db.get('homes', id)
    },
    async save(candidate: HomeCandidate) {
      await db.put('homes', stamp(candidate, clock))
    },
    async restoreMany(candidates: readonly HomeCandidate[]) {
      const tx = db.transaction('homes', 'readwrite')
      await Promise.all([...candidates.map((one) => tx.store.put(one)), tx.done])
    },
    async remove(id: HomeCandidateId) {
      await db.delete('homes', id)
      await bury(db, clock, 'homes', id)
    },
    async purge(id: HomeCandidateId) {
      await db.delete('homes', id)
    },
  }
}

export function createRoomRepository(db: AppDatabase, clock: Clock): RoomRepository {
  return {
    async all() {
      return db.getAll('rooms')
    },
    async byId(id: RoomId) {
      return db.get('rooms', id)
    },
    async save(room: Room) {
      await db.put('rooms', stamp(room, clock))
    },
    async restoreMany(rooms: readonly Room[]) {
      const tx = db.transaction('rooms', 'readwrite')
      await Promise.all([...rooms.map((one) => tx.store.put(one)), tx.done])
    },
    async remove(id: RoomId) {
      await db.delete('rooms', id)
      await bury(db, clock, 'rooms', id)
    },
    async purge(id: RoomId) {
      await db.delete('rooms', id)
    },
  }
}
