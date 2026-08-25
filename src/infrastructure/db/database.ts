import type { DBSchema, IDBPDatabase } from 'idb'
import { openDB } from 'idb'

import type { CheckIn } from '@/domain/autoregulation/check-in'
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
export const DB_VERSION = 2

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
  const tx = db.transaction(['exercises', 'position', 'workouts', 'checkIns'], 'readwrite')

  await Promise.all([
    tx.objectStore('exercises').clear(),
    tx.objectStore('position').clear(),
    tx.objectStore('workouts').clear(),
    tx.objectStore('checkIns').clear(),
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
