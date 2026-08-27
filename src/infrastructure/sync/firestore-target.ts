import {
  collection,
  doc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Place } from '@/domain/atlas/place/Place'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { SyncTarget } from '@/domain/repositories/ports'
import { CURSOR_START, decodeCursor, encodeCursor, laterCursor } from '@/domain/sync/cursor'
import type { SyncedSettings } from '@/domain/settings/synced'
import type { SyncPayload } from '@/domain/sync/payload'
import { tombstoneKey, type Tombstone } from '@/domain/sync/tombstone'

/**
 * Firestore as a place to leave changes for another device to collect.
 *
 * One document per record, under `users/{uid}`, rather than one document
 * per batch. Two reasons, and the second is the load-bearing one:
 *
 *   - A Firestore document caps at 1 MiB. A batch document would work
 *     until the day a lifter with two years of history first synced, and
 *     then fail permanently.
 *   - A record keyed by its own id is *idempotent*. Pushing the same
 *     workout twice leaves one workout. A log of batches accumulates
 *     forever and makes a first sync replay every change ever made.
 *
 * Every document carries `syncedAt: serverTimestamp()`, and that field —
 * not the record's own `updatedAt` — is what pulls are ordered and
 * filtered by. The distinction is the whole reason this works across two
 * devices: `updatedAt` is written by whichever phone or laptop touched
 * the record, and two clocks disagree. A device four minutes fast would
 * otherwise write records that appear four minutes in the future, and the
 * other device would skip everything it did in that window.
 */

/** Kept short: it is repeated on every document. */
const COLLECTIONS = {
  exercises: 'exercises',
  workouts: 'workouts',
  checkIns: 'checkIns',
  items: 'items',
  projects: 'projects',
  upgrades: 'upgrades',
  friends: 'friends',
  metrics: 'metrics',
  reviews: 'reviews',
  places: 'places',
  trips: 'trips',
  /*
   * One document holding the whole set, not a document per cell. A
   * thousand-cell walk would otherwise be a thousand writes, and the set
   * has no per-cell metadata worth a row — the merge is a union either
   * way.
   */
  exploredCells: 'exploredCells',
  tombstones: 'tombstones',
  /*
   * One document, not a collection. There is one settings blob, and it is
   * stored under a fixed id so writing it is an overwrite rather than an
   * accumulation.
   */
  settings: 'settings',
} as const

const SETTINGS_DOCUMENT = 'current'

/**
 * How many documents one pull will take.
 *
 * A pull that returned everything would, on a first sync against a long
 * history, build one enormous in-memory payload and write it in one
 * transaction. Bounded instead: the cursor advances to the last document
 * actually read, so the next exchange continues from there. A first sync
 * takes several rounds and each one is small enough to survive a phone
 * losing signal halfway through.
 */
export const PULL_PAGE_SIZE = 300

interface StoredRecord {
  readonly writtenBy: string
  readonly syncedAt: Timestamp | null
  readonly record: unknown
}

export interface FirestoreTargetOptions {
  readonly db: Firestore
  /** The signed-in account. Every document lives under it. */
  readonly uid: string
  /** This device, so it does not collect its own writes. */
  readonly clientId: string
}

export function createFirestoreSyncTarget(options: FirestoreTargetOptions): SyncTarget {
  const { db, uid, clientId } = options
  const root = (name: string) => collection(db, 'users', uid, name)

  return {
    name: 'Firestore',

    async pull(cursor: string | undefined) {
      const from = decodeCursor(cursor)
      const after = new Timestamp(from.seconds, from.nanoseconds)

      const [
        exercises,
        workouts,
        checkIns,
        items,
        projects,
        upgrades,
        friends,
        metrics,
        reviews,
        places,
        trips,
        cells,
        tombstones,
        settings,
      ] = await Promise.all([
        readSince(root(COLLECTIONS.exercises), after),
        readSince(root(COLLECTIONS.workouts), after),
        readSince(root(COLLECTIONS.checkIns), after),
        readSince(root(COLLECTIONS.items), after),
        readSince(root(COLLECTIONS.projects), after),
        readSince(root(COLLECTIONS.upgrades), after),
        readSince(root(COLLECTIONS.friends), after),
        readSince(root(COLLECTIONS.metrics), after),
        readSince(root(COLLECTIONS.reviews), after),
        readSince(root(COLLECTIONS.places), after),
        readSince(root(COLLECTIONS.trips), after),
        readSince(root(COLLECTIONS.exploredCells), after),
        readSince(root(COLLECTIONS.tombstones), after),
        readSince(root(COLLECTIONS.settings), after),
      ])

      /*
       * **Every** page, and the completeness is load-bearing.
       *
       * `reached` is the high-water mark of what actually came back, and a
       * collection left out of this list cannot advance it. That fails
       * safe — the cursor stays put and the next pull re-reads — but it
       * fails permanently: if the only thing that ever changes is a
       * collection missing from here, the cursor never moves and every
       * pull re-reads the entire history from that point, forever. Three
       * collections were missing when the atlas was added.
       */
      const pages = [
        exercises,
        workouts,
        checkIns,
        items,
        projects,
        upgrades,
        friends,
        metrics,
        reviews,
        places,
        trips,
        cells,
        tombstones,
        settings,
      ]

      /*
       * The cursor advances to the newest document actually read, and no
       * further.
       *
       * Not "now", and not the newest document that exists. Each
       * collection is paged independently, so one of them may have
       * stopped short of the others — advancing past what was read would
       * skip the remainder permanently. Stopping at the high-water mark
       * of what came back means the next pull re-reads a little and loses
       * nothing.
       */
      const reached = pages.reduce((latest, page) => laterCursor(latest, page.reached), from)

      /*
       * The last, because there is only ever one document and a page
       * ordered by `syncedAt` puts the newest write at the end. Taking
       * the first would hand back a settings blob that has since been
       * replaced.
       */
      const latestSettings = settings.records[settings.records.length - 1]

      return {
        payload: {
          exercises: exercises.records as readonly Exercise[],
          workouts: workouts.records as readonly WorkoutLog[],
          checkIns: checkIns.records as readonly CheckIn[],
          items: items.records as readonly Item[],
          projects: projects.records as readonly Project[],
          upgrades: upgrades.records as readonly Upgrade[],
          friends: friends.records as readonly Friend[],
          metrics: metrics.records as readonly MetricDefinition[],
          reviews: reviews.records as readonly MonthlySnapshot[],
          places: places.records as readonly Place[],
          trips: trips.records as readonly Trip[],
          exploredCells: cells.records.flatMap(
            (record) => (record as { cells?: readonly string[] }).cells ?? [],
          ),
          tombstones: tombstones.records as readonly Tombstone[],
          ...(latestSettings === undefined ? {} : { settings: latestSettings as SyncedSettings }),
        },
        cursor: encodeCursor(reached),
      }
    },

    async push(payload: SyncPayload) {
      /*
       * Written in chunks, because a Firestore batch holds at most 500
       * operations and a first push carries a whole history.
       *
       * Not atomic across chunks, deliberately: a push interrupted
       * halfway leaves some records written and the local watermark
       * unmoved, so the next exchange sends the whole batch again. Writes
       * are keyed by id, so re-sending is a no-op rather than a
       * duplicate. Atomicity would buy nothing and cap the payload at 500
       * records forever.
       */
      const operations = [
        ...payload.exercises.map((record) => ({
          path: COLLECTIONS.exercises,
          id: record.id,
          record,
        })),
        ...payload.workouts.map((record) => ({
          path: COLLECTIONS.workouts,
          id: record.id,
          record,
        })),
        ...payload.friends.map((record) => ({
          path: COLLECTIONS.friends,
          id: record.id,
          record,
        })),
        ...payload.metrics.map((record) => ({
          path: COLLECTIONS.metrics,
          id: record.id,
          record,
        })),
        ...payload.reviews.map((record) => ({
          path: COLLECTIONS.reviews,
          id: record.month,
          record,
        })),
        ...payload.upgrades.map((record) => ({
          path: COLLECTIONS.upgrades,
          id: record.id,
          record,
        })),
        ...payload.projects.map((record) => ({
          path: COLLECTIONS.projects,
          id: record.id,
          record,
        })),
        ...payload.items.map((record) => ({
          path: COLLECTIONS.items,
          id: record.id,
          record,
        })),
        ...payload.checkIns.map((record) => ({
          path: COLLECTIONS.checkIns,
          id: record.id,
          record,
        })),
        ...payload.tombstones.map((record) => ({
          path: COLLECTIONS.tombstones,
          id: tombstoneKey(record.collection, record.id),
          record,
        })),
        // Under a fixed id, so a second push overwrites rather than
        // accumulating settings blobs nobody will read.
        ...(payload.settings === undefined
          ? []
          : [{ path: COLLECTIONS.settings, id: SETTINGS_DOCUMENT, record: payload.settings }]),
      ]

      for (let index = 0; index < operations.length; index += BATCH_LIMIT) {
        const batch = writeBatch(db)

        for (const operation of operations.slice(index, index + BATCH_LIMIT)) {
          batch.set(doc(root(operation.path), operation.id), {
            writtenBy: clientId,
            syncedAt: serverTimestamp(),
            record: stripUndefined(operation.record),
          })
        }

        await batch.commit()
      }
    },
  }

  async function readSince(
    ref: ReturnType<typeof root>,
    after: Timestamp,
  ): Promise<{ records: readonly unknown[]; reached: { seconds: number; nanoseconds: number } }> {
    const snapshot = await getDocs(
      query(ref, where('syncedAt', '>', after), orderBy('syncedAt'), limitTo(PULL_PAGE_SIZE)),
    )

    const records: unknown[] = []
    let reached = CURSOR_START

    for (const document of snapshot.docs) {
      const stored = document.data() as StoredRecord

      /*
       * A document whose server timestamp has not landed yet is skipped.
       *
       * `serverTimestamp()` reads as null locally between the write and
       * the server's acknowledgement. Such a document has no position in
       * the ordering, so taking it now would mean taking it again later
       * from the same cursor — and, worse, could move the cursor past
       * documents that do have one.
       */
      if (stored.syncedAt === null) continue

      // This device's own writes. Collecting them would rewrite records
      // over themselves and report work that never moved.
      if (stored.writtenBy === clientId) {
        reached = laterCursor(reached, toPosition(document))
        continue
      }

      records.push(stored.record)
      reached = laterCursor(reached, toPosition(document))
    }

    return { records, reached }
  }
}

/** Firestore's cap on operations in one batched write. */
const BATCH_LIMIT = 500

function toPosition(document: QueryDocumentSnapshot): { seconds: number; nanoseconds: number } {
  const stored = document.data() as StoredRecord
  const at = stored.syncedAt

  return at === null ? CURSOR_START : { seconds: at.seconds, nanoseconds: at.nanoseconds }
}

/**
 * Firestore rejects `undefined` as a field value; the domain uses it
 * throughout for "this record has no note / no bodyweight / no RPE".
 *
 * Dropping the key rather than writing null keeps the round trip exact:
 * an absent optional field reads back as absent, which is what it was.
 * Writing null would turn every unanswered RPE into an answered one whose
 * answer is null, and `exactOptionalPropertyTypes` means the domain can
 * tell the difference even when JavaScript cannot.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => stripUndefined(item)) as T
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value

  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}

  for (const [key, item] of Object.entries(source)) {
    if (item === undefined) continue
    result[key] = stripUndefined(item)
  }

  return result as T
}
