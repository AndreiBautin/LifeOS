import type { HomeCandidate } from '@/domain/homes/candidate'
import type { Attempt } from '@/domain/mind/practice'
import type { Campaign } from '@/domain/campaign/campaign'
import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'

import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { FinanceReading } from '@/domain/finance/reading'
import type { Resume } from '@/domain/resume/resume'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Place } from '@/domain/atlas/place/Place'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { Daily } from '@/domain/dailies/daily'
import type { Vice } from '@/domain/vitals/charges'
import type { WeighIn } from '@/domain/vitals/weight'
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

/**
 * Renamed with the app, which was only free because it happened before
 * there was anything to lose.
 *
 * A database name is an *address*, not a label: changing it does not
 * migrate anything, it opens a second empty database beside the first and
 * strands every record in one nothing opens any more. Doing it now cost a
 * factory reset of a database holding test data. Doing it later would have
 * meant writing a migration, or living with a database called `lift`
 * inside an app called LifeOS forever.
 */
export const DB_NAME = 'lifeos'

/**
 * Bump this and add an upgrade step below. Never edit an existing step —
 * a device that already ran it will not run it again, so changing one
 * leaves two devices with different schemas and no way to tell.
 */
export const DB_VERSION = 15

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

/** The shape rows in the retired `conditions` store were written in. */
interface RetiredDayCondition {
  readonly day: string
  readonly [field: string]: unknown
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
  /** Places worth going to, visited or not. */
  places: {
    key: string
    value: Place
    indexes: { 'by-status': string; 'by-category': string }
  }
  trips: {
    key: string
    value: Trip
  }
  /**
   * Habits, and the days they were done.
   *
   * Completions live on the record as a set of day keys rather than in a
   * store of their own. They are small, always read with the habit, and
   * merge by union — which is what makes two devices ticking the same
   * Tuesday converge instead of counting it twice.
   */
  dailies: {
    key: string
    value: Daily
  }
  /**
   * Things you mean to have less of, and every charge ever spent.
   *
   * The spends live on the record as a list of timestamps, for the reason
   * a daily's completions do: they are small, never read without the
   * pool they belong to, and merge by union. A separate store would make
   * two devices' spends a set of rows to reconcile rather than a list to
   * concatenate and dedupe.
   */
  vices: {
    key: string
    value: Vice
  }
  /**
   * One bodyweight reading per day, keyed by the day.
   *
   * The day is the key rather than a generated id, which is what makes
   * weighing twice on one morning a *correction* rather than two data
   * points. Two devices holding a reading for the same day are two
   * opinions about one fact, and last-write-wins is the right answer to
   * that — unlike a set of rows, where both would survive and quietly
   * average.
   */
  weighIns: {
    key: string
    value: WeighIn
  }
  /** Houses being considered, with the last read of what is near them. */
  homes: {
    key: string
    value: HomeCandidate
  }
  /** Problems practised, one row each. */
  attempts: {
    key: string
    value: Attempt
  }
  /** The long arcs -- the move, and anything shaped like it. */
  campaigns: {
    key: string
    value: Campaign
  }
  /** The resume, one row under a fixed key. */
  resume: {
    key: string
    value: Resume
  }
  /** The money figures, one row a month. */
  finance: {
    key: string
    value: FinanceReading
  }
  /**
   * **A retired store, declared here and written by nothing.**
   *
   * The self-rated condition log is gone from the app — its five factors
   * were a mood where the app wants a measurement, and the session
   * adjustment they were supposed to feed was never wired to a session.
   *
   * The store stays for two reasons. Removing it would mean editing
   * migration step 10, which is the one thing this file must never do:
   * a device that has run that step keeps the store, one that has not
   * would never make it, and the two schemas diverge with no way to tell
   * them apart. And the rows are a true record of days somebody rated —
   * the same argument that retires a habit rather than deleting it.
   *
   * Typed locally rather than from a domain module, because the domain
   * no longer has an opinion about this shape. Nothing reads these rows;
   * if that ever changes, it needs a domain type again and a reason.
   */
  conditions: {
    key: string
    value: RetiredDayCondition
  }
  /**
   * Ground you have walked, one row per geohash cell.
   *
   * A store rather than the single blob it arrived as, and that is the
   * whole of step 5c. As one blob it is one record under one stamp, and a
   * record-level winner erases whichever device walked less recently. As
   * rows it is a grow-only set: two devices union, nothing is lost, and
   * the question of which copy is newer never comes up.
   *
   * The cell id is the key and there is nothing else in the row. That is
   * not minimalism — there is genuinely nothing else to say about a cell
   * beyond the fact that you stood in it.
   */
  exploredCells: {
    key: string
    value: { readonly id: string }
  }
}

export type AppDatabase = IDBPDatabase<LiftDB>

let connection: Promise<AppDatabase> | undefined

export function openDatabase(name = DB_NAME): Promise<AppDatabase> {
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

      /*
       * Version 8 brings the atlas in.
       *
       * `exploredCells` is one row per cell rather than the single blob it
       * arrived as — see the store's own note. That shape is the reason
       * the fog can sync at all.
       */
      if (oldVersion < 8) {
        const places = db.createObjectStore('places', { keyPath: 'id' })
        places.createIndex('by-status', 'status')
        places.createIndex('by-category', 'categoryId')

        db.createObjectStore('trips', { keyPath: 'id' })
        db.createObjectStore('exploredCells', { keyPath: 'id' })
      }

      if (oldVersion < 9) {
        db.createObjectStore('dailies', { keyPath: 'id' })
      }

      if (oldVersion < 10) {
        db.createObjectStore('vices', { keyPath: 'id' })
        // Keyed by day, so a second weigh-in replaces the first.
        db.createObjectStore('weighIns', { keyPath: 'day' })
        db.createObjectStore('conditions', { keyPath: 'day' })
      }

      /*
       * A new guarded block rather than an edit to the one above, which
       * is the rule this file states and the one it must never break: a
       * device that already ran step 10 will not run it again, so adding
       * a store there would reach nobody who has opened the app.
       */
      if (oldVersion < 11) {
        // Keyed by month, so re-entering August corrects it.
        db.createObjectStore('finance', { keyPath: 'month' })
      }

      if (oldVersion < 12) {
        /*
         * One row, under a fixed key. There is no `keyPath` because the
         * resume has no id of its own — it is a singleton, and giving it
         * one would invite a second.
         */
        db.createObjectStore('resume')
      }

      if (oldVersion < 15) {
        db.createObjectStore('homes', { keyPath: 'id' })
      }

      if (oldVersion < 14) {
        // Problems solved. Keyed by id and indexed by nothing: the log is
        // read whole and filtered in memory, which is right for a few
        // hundred rows and wrong at a scale this will not reach.
        db.createObjectStore('attempts', { keyPath: 'id' })
      }

      if (oldVersion < 13) {
        // The long arcs. Keyed by id; a campaign holds its stages inline
        // rather than in a second store, because a stage has no meaning
        // apart from the arc it belongs to and nothing queries them.
        db.createObjectStore('campaigns', { keyPath: 'id' })
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
export async function closeAppDatabase(): Promise<void> {
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
export async function clearAllStores(db: AppDatabase): Promise<void> {
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
      'places',
      'trips',
      'dailies',
      'exploredCells',
      'vices',
      'weighIns',
      'conditions',
      'finance',
      'resume',
      'campaigns',
      'attempts',
      'homes',
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
    tx.objectStore('places').clear(),
    tx.objectStore('trips').clear(),
    tx.objectStore('dailies').clear(),
    tx.objectStore('exploredCells').clear(),
    tx.objectStore('vices').clear(),
    tx.objectStore('weighIns').clear(),
    tx.objectStore('conditions').clear(),
    tx.objectStore('finance').clear(),
    tx.objectStore('resume').clear(),
    tx.objectStore('campaigns').clear(),
    tx.objectStore('attempts').clear(),
    tx.objectStore('homes').clear(),
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
