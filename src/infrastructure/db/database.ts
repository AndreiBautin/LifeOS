import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'

import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Tombstone } from '@/domain/sync/tombstone'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramPosition } from '@/domain/programs/position'

/**
 * The one place a database connection is opened.
 *
 * Everything else goes through this so that every connection runs the
 * same migration chain. A second `openDB` call elsewhere with a different
 * upgrade function is how a schema quietly forks between two devices, and
 * an ESLint rule forbids `indexedDB` outside this directory to keep that
 * from happening.
 *
 * Why IndexedDB rather than localStorage, which is what the two source
 * repositories reached for when they wanted anything local:
 *
 *   - Training history is unbounded. Roughly one record per set means a
 *     few thousand rows in the first year and tens of thousands after
 *     that. localStorage is a synchronous, main-thread, ~5 MB string
 *     store, so logging one set would mean re-serialising the entire
 *     history and blocking the UI to do it.
 *   - The two queries the app leans on — "what did I do on this exercise
 *     last time" and "how has my estimated max moved" — are index range
 *     scans here. StrengthFlow answered the first by downloading every
 *     workout document and scanning it in JavaScript, on every set.
 *   - Structured clone means dates and numbers survive without a JSON
 *     round-trip.
 *   - Quota is a share of free disk rather than five megabytes.
 */

export const DB_NAME = 'lift'

/**
 * Bump this and add an upgrade step below. Never edit an existing step —
 * a device that already ran it will not run it again, so changing one
 * leaves two devices with different schemas and no way to tell.
 */
export const DB_VERSION = 7

/**
 * A workout as it is stored, which is not quite a workout as the domain
 * models one.
 *
 * IndexedDB key paths cannot reach into the elements of an array, so
 * `entries.exerciseId` indexes nothing — the multi-entry index needs a
 * property that *is* an array of keys. `exerciseIds` is that array,
 * derived on write and stripped on read, so the domain type stays free of
 * a field that exists only to satisfy the storage engine.
 *
 * Deriving it in one place, rather than asking callers to maintain it, is
 * what keeps the index from silently going stale.
 */
export type StoredWorkout = WorkoutLog & { readonly exerciseIds: readonly string[] }

export function toStored(log: WorkoutLog): StoredWorkout {
  return { ...log, exerciseIds: [...new Set(log.entries.map((entry) => entry.exerciseId))] }
}

export function fromStored(stored: StoredWorkout): WorkoutLog {
  const { exerciseIds: _index, ...log } = stored
  return log
}

export interface LiftDB extends DBSchema {
  exercises: {
    key: string
    value: Exercise
    indexes: { 'by-muscle': string; 'by-name': string }
  }
  /**
   * Where the lifter is in the program — a single record under a fixed
   * key, because there is only ever one.
   *
   * The program itself is not stored. It is derived from settings on
   * demand, which is what removed a whole class of staleness: a stored
   * copy cannot go out of date if there is no stored copy.
   */
  position: {
    key: string
    value: ProgramPosition
  }
  workouts: {
    key: string
    value: StoredWorkout
    indexes: {
      'by-date': string
      'by-status': string
      'by-instance': string
      /**
       * Multi-entry over every exercise appearing in a workout. This is
       * what turns "previous performance for this lift" from a full scan
       * into a lookup, and it is the single most important index here.
       *
       * The key type is the *element* type, not the array: a multi-entry
       * index produces one entry per member, so a lookup is by a single
       * exercise id.
       */
      'by-exercise': string
    }
  }
  checkIns: {
    key: string
    value: CheckIn
    indexes: { 'by-workout': string; 'by-recorded': string }
  }
  /**
   * What has been deleted, and when.
   *
   * Keyed by `collection:id` rather than by id alone, because ids are
   * only unique within a collection and a single store holds all three.
   * Indexed by `deletedAt` so a sync can ask for deletions since it last
   * ran without reading the whole store.
   *
   * This grows forever, which is acceptable at this size — a tombstone is
   * three short strings, and a lifter who deleted one session a week for
   * a decade would accumulate about thirty kilobytes. Pruning them is
   * only safe once every device is known to have seen them, which is a
   * question this app cannot currently answer, so it does not try.
   */
  tombstones: {
    key: string
    value: Tombstone
    indexes: { 'by-deleted': string }
  }
  /**
   * The backlog — games, books, series.
   *
   * IndexedDB rather than the localStorage blob it arrived in. Backlogs
   * rewrote its entire collection on every write, which is affordable for
   * a few hundred items on one device and is a clobber the moment a second
   * one exists: two devices each rewriting the whole list means the later
   * write erases everything the earlier one added.
   *
   * Indexed by status and category because those are the two the list
   * screen filters on, and by `dateAdded` because that is its default
   * order.
   */
  items: {
    key: string
    value: Item
    indexes: { 'by-status': string; 'by-category': string; 'by-added': string }
  }
  /**
   * The quest log — projects, and the checklist inside each one.
   *
   * Actions are embedded in the project record rather than stored beside
   * it. They are always read with their project and never queried on their
   * own, so a second store would buy an index nothing would use and a
   * transaction spanning two stores on every write.
   *
   * One index, on status, because that is the only filter the screen
   * applies. Ranking is a computation over the whole list and cannot be
   * an index — it depends on today's date.
   */
  projects: {
    key: string
    value: Project
    indexes: { 'by-status': string }
  }
  /**
   * The tech tree — things being saved up for, and what comes first.
   *
   * No index on priority, deliberately. What the screen orders by is
   * *effective* priority, which a node inherits from the most important
   * thing it unblocks — a property of the whole graph rather than of any
   * record, so it cannot be an index and has to be computed from the full
   * list. At a few dozen rows that is a single read.
   */
  upgrades: {
    key: string
    value: Upgrade
    indexes: { 'by-status': string }
  }
  /** The people in your circle. */
  friends: {
    key: string
    value: Friend
    indexes: { 'by-last-hangout': string }
  }
  /**
   * Metrics defined by hand.
   *
   * Only the hand-defined ones. The measured metrics are derived from
   * `domain/game/registry.ts` on every read — a stored copy of a
   * declaration can only ever be a stale one, which is the same reason
   * the training program is not stored either.
   */
  metrics: {
    key: string
    value: MetricDefinition
  }
  /**
   * One record per month, keyed by the month.
   *
   * The key *is* the invariant: one review per month, so re-entering a
   * value fixes the one already there rather than adding a second reading
   * nobody asked for.
   */
  reviews: {
    key: string
    value: MonthlySnapshot
  }
}

export type LiftDatabase = IDBPDatabase<LiftDB>

let connection: Promise<LiftDatabase> | undefined

export function openLiftDatabase(name = DB_NAME): Promise<LiftDatabase> {
  connection ??= openDB<LiftDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Each step is guarded by the version it was introduced at, and
      // runs in order, so a device three versions behind catches up in
      // one open rather than needing an intermediate release.
      if (oldVersion < 1) {
        const exercises = db.createObjectStore('exercises', { keyPath: 'id' })
        exercises.createIndex('by-muscle', 'primaryMuscle')
        exercises.createIndex('by-name', 'name')

        const workouts = db.createObjectStore('workouts', { keyPath: 'id' })
        workouts.createIndex('by-date', 'date')
        workouts.createIndex('by-status', 'status')
        workouts.createIndex('by-exercise', 'exerciseIds', { multiEntry: true })

        const checkIns = db.createObjectStore('checkIns', { keyPath: 'id' })
        checkIns.createIndex('by-workout', 'workoutId')
        checkIns.createIndex('by-recorded', 'recordedAt')
      }

      /*
       * Version 2 drops the program library.
       *
       * Programs are derived from settings now, so a stored template can
       * only be a stale copy of one. The stores are removed rather than
       * left behind: an unused store that still holds plausible data is
       * how the next person to read this concludes programs are stored
       * after all.
       *
       * Nothing in a lifter's history goes with them. A workout log
       * embeds the prescription of every set it contains, so it describes
       * itself without reference to any template.
       */
      if (oldVersion < 2) {
        // Cast because the current schema type no longer knows these
        // stores — which is the point: they are being removed.
        const names = db.objectStoreNames as unknown as DOMStringList
        for (const name of ['programs', 'instances']) {
          if (names.contains(name)) db.deleteObjectStore(name as never)
        }

        if (!names.contains('position')) db.createObjectStore('position')
      }

      /*
       * Version 3 records deletions.
       *
       * Until now a deleted row simply stopped existing, which reads to
       * any merge as a record the other copy knows about and this one
       * does not — so it comes back. See `domain/sync/tombstone.ts`.
       *
       * Nothing is backfilled. Records already in the database have no
       * `updatedAt`, and a tombstone store starting empty is correct:
       * nothing has been deleted *since deletions started being
       * recorded*, which is precisely the claim it should be making.
       */
      if (oldVersion < 3) {
        const tombstones = db.createObjectStore('tombstones')
        tombstones.createIndex('by-deleted', 'deletedAt')
      }

      /*
       * Version 4 brings the backlog in.
       *
       * The first absorbed app. Nothing is migrated from anywhere — the
       * old app's data comes across through its own export file, once,
       * along the import path, rather than through a schema step that
       * would have to know about another origin's localStorage.
       */
      if (oldVersion < 4) {
        const items = db.createObjectStore('items', { keyPath: 'id' })
        items.createIndex('by-status', 'status')
        items.createIndex('by-category', 'category')
        items.createIndex('by-added', 'dateAdded')
      }

      /*
       * Version 5 brings the quest log in.
       *
       * The second absorbed app, and the first that was a .NET service.
       * Nothing migrates automatically here either — its data arrives
       * through an export file, once, along the import path.
       */
      if (oldVersion < 5) {
        const projects = db.createObjectStore('projects', { keyPath: 'id' })
        projects.createIndex('by-status', 'status')
      }

      /* Version 6 brings the tech tree in. */
      if (oldVersion < 6) {
        const upgrades = db.createObjectStore('upgrades', { keyPath: 'id' })
        upgrades.createIndex('by-status', 'status')
      }

      /*
       * Version 7 brings the scoring spine and the social circle in.
       *
       * `reviews` is keyed by month rather than by an id, which is the
       * one place in this schema where the key carries meaning — one
       * review per month is the invariant, and making the month the key
       * is what enforces it rather than a uniqueness check somebody has
       * to remember to run.
       */
      if (oldVersion < 7) {
        const friends = db.createObjectStore('friends', { keyPath: 'id' })
        friends.createIndex('by-last-hangout', 'lastHangout')

        db.createObjectStore('metrics', { keyPath: 'id' })
        db.createObjectStore('reviews', { keyPath: 'month' })
      }
    },

    blocked() {
      // Another tab is holding the old version open. The app shows a
      // prompt rather than failing silently, because the alternative is a
      // tab that appears to work and writes to a stale schema.
      reportBlocked()
    },

    blocking() {
      // This tab is holding an old version open while another wants to
      // upgrade. Close so the upgrade can proceed.
      void connection?.then((db) => {
        db.close()
        connection = undefined
      })
    },
  })

  return connection
}

/** Closes the shared connection. Used by tests and by the import flow. */
export async function closeLiftDatabase(): Promise<void> {
  const existing = connection
  connection = undefined
  if (existing !== undefined) {
    const db = await existing
    db.close()
  }
}

/**
 * Deletes every record in every store, in one transaction.
 *
 * Used only by a `replace` import, which the UI gates behind a typed
 * confirmation. Kept as its own named operation rather than a flag on the
 * seeding path, so no call site can ask to fill an empty database and
 * receive a wipe instead.
 */
export async function clearAllStores(db: LiftDatabase): Promise<void> {
  const tx = db.transaction(
    [
      'exercises',
      'position',
      'workouts',
      'checkIns',
      'items',
      'projects',
      'upgrades',
      'friends',
      'metrics',
      'reviews',
    ],
    'readwrite',
  )

  await Promise.all([
    tx.objectStore('exercises').clear(),
    tx.objectStore('position').clear(),
    tx.objectStore('workouts').clear(),
    tx.objectStore('checkIns').clear(),
    tx.objectStore('items').clear(),
    tx.objectStore('projects').clear(),
    tx.objectStore('upgrades').clear(),
    tx.objectStore('friends').clear(),
    tx.objectStore('metrics').clear(),
    tx.objectStore('reviews').clear(),
    tx.done,
  ])
}

type BlockedHandler = () => void

let blockedHandler: BlockedHandler | undefined

/** Lets the app surface an upgrade blocked by another tab. */
export function onUpgradeBlocked(handler: BlockedHandler): void {
  blockedHandler = handler
}

function reportBlocked(): void {
  blockedHandler?.()
}
