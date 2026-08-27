import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { ProgramPosition } from '@/domain/programs/position'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { resolveLibrary } from '@/domain/exercises/library'
import type {
  BacklogItemId,
  CheckInId,
  ExerciseId,
  FriendId,
  MetricId,
  ProjectId,
  UpgradeId,
  WorkoutId,
} from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  BacklogItemRepository,
  CheckInRepository,
  Clock,
  ExerciseRepository,
  PositionRepository,
  FriendRepository,
  ProjectRepository,
  ReviewRepository,
  UpgradeRepository,
  TombstoneRepository,
  WorkoutQuery,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { Tombstone, TombstonedCollection } from '@/domain/sync/tombstone'
import { tombstoneKey } from '@/domain/sync/tombstone'

import { fromStored, toStored, type LiftDatabase } from './database'

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
  db: LiftDatabase,
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
export function createTombstoneRepository(db: LiftDatabase): TombstoneRepository {
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
export function createExerciseRepository(db: LiftDatabase, clock: Clock): ExerciseRepository {
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

export function createPositionRepository(db: LiftDatabase): PositionRepository {
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

export function createWorkoutRepository(db: LiftDatabase, clock: Clock): WorkoutRepository {
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
export function createBacklogItemRepository(db: LiftDatabase, clock: Clock): BacklogItemRepository {
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
export function createProjectRepository(db: LiftDatabase, clock: Clock): ProjectRepository {
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
export function createUpgradeRepository(db: LiftDatabase, clock: Clock): UpgradeRepository {
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

export function createFriendRepository(db: LiftDatabase, clock: Clock): FriendRepository {
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
export function createReviewRepository(db: LiftDatabase, clock: Clock): ReviewRepository {
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

export function createCheckInRepository(db: LiftDatabase, clock: Clock): CheckInRepository {
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
