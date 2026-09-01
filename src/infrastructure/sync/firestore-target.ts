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

import type { Room } from '@/domain/base/declutter'
import type { HomeCandidate } from '@/domain/homes/candidate'
import type { Attempt } from '@/domain/mind/practice'
import type { Campaign } from '@/domain/campaign/campaign'
import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Place } from '@/domain/atlas/place/Place'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { Daily } from '@/domain/dailies/daily'
import type { Vice } from '@/domain/vitals/charges'
import type { FinanceReading } from '@/domain/finance/reading'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { SyncTarget } from '@/domain/repositories/ports'
import { CURSOR_START, decodeCursor, encodeCursor, laterCursor } from '@/domain/sync/cursor'
import type { Resume } from '@/domain/resume/resume'
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
  dailies: 'dailies',
  vices: 'vices',
  finance: 'finance',
  campaigns: 'campaigns',
  attempts: 'attempts',
  homes: 'homes',
  rooms: 'rooms',
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
  /*
   * The other single document. One resume, stored under a fixed id, for
   * the same reason the settings blob is — and absent from every one of
   * these lists until it was looked for, so it lived on one device, was
   * in no backup, and was the most expensive record in the app to type
   * again.
   */
  resume: 'resume',
} as const

/** Both singletons are stored under this id, so a write overwrites. */
const SETTINGS_DOCUMENT = 'current'

/**
 * The payload fields that carry a list of records.
 *
 * Derived from {@link SyncPayload} rather than written out, so the two
 * cannot drift — the same reason `pull` reads its cursor off the array
 * it destructures instead of a second list beside it.
 */
type ListField = {
  [K in keyof SyncPayload]-?: SyncPayload[K] extends readonly unknown[] ? K : never
}[keyof SyncPayload]

/** Every list field except the one stored as a whole set. */
type KeyedField = Exclude<ListField, 'exploredCells'>

/**
 * What keys each record, as a mapped type over the payload itself.
 *
 * **This is the guard, and it is the compiler rather than a test.**
 * Adding a collection to `SyncPayload` without naming its key here fails
 * the build — the same mechanism that makes `MUSCLE_GROUP_LABELS` catch
 * a new muscle group, and the mechanism this file did not have.
 *
 * What its absence cost: `push` was a hand-written list of ten beside a
 * hand-written `pull` of twenty-four, and twelve collections — places,
 * trips, dailies, vices, weighIns, finance, campaigns, attempts, homes,
 * rooms, exploredCells and `dayReadings` (since scrapped) — were read
 * from the server and written to it by nothing. Not a lost record but a lost *direction*: a
 * device whose changes that day were a habit tick, a weigh-in or a
 * night's sleep built a payload `isEmpty` correctly called non-empty,
 * uploaded none of it, advanced its watermark past it, and reported a
 * successful sync. Most of the app was one-way, and from both ends it
 * looked exactly like working sync.
 *
 * Three of these are keyed by a date rather than an id, which is the
 * detail a hand-written list gets wrong quietly: a weigh-in and a day
 * reading are keyed by their day and a finance row by its month, so
 * writing them under an `id` they do not carry would file every one of
 * them under the same missing key and leave one document per collection.
 */
const KEYED_BY: {
  readonly [K in KeyedField]: (record: SyncPayload[K][number]) => string
} = {
  exercises: (record) => record.id,
  workouts: (record) => record.id,
  checkIns: (record) => record.id,
  items: (record) => record.id,
  projects: (record) => record.id,
  upgrades: (record) => record.id,
  friends: (record) => record.id,
  metrics: (record) => record.id,
  reviews: (record) => record.month,
  places: (record) => record.id,
  trips: (record) => record.id,
  dailies: (record) => record.id,
  vices: (record) => record.id,
  finance: (record) => record.month,
  campaigns: (record) => record.id,
  attempts: (record) => record.id,
  homes: (record) => record.id,
  rooms: (record) => record.id,
  tombstones: (record) => tombstoneKey(record.collection, record.id),
}

export interface PushOperation {
  readonly path: string
  readonly id: string
  readonly record: unknown
}

/**
 * What a push would write, worked out without touching Firestore.
 *
 * Pure and exported so it can be tested for real. The rest of this file
 * is a query builder over the SDK, and a double for it would only assert
 * that this file calls the functions this file calls — but *which
 * records go up, and under what key* is a decision rather than a call,
 * and it is the one that was wrong.
 */
export function pushOperations(payload: SyncPayload, clientId: string): readonly PushOperation[] {
  const keyed = Object.keys(KEYED_BY).flatMap((name) => {
    const key = name as KeyedField

    /*
     * Both casts are safe by construction and neither can be stated to
     * the compiler: `KEYED_BY` is a mapped type over these very keys, so
     * the function found at `key` is by definition the one that keys
     * `payload[key]`. Indexing by a union is what loses that pairing.
     */
    const idOf = KEYED_BY[key] as (record: unknown) => string
    const records: readonly unknown[] = payload[key]

    return records.map((record) => ({ path: COLLECTIONS[key], id: idOf(record), record }))
  })

  return [
    ...keyed,
    /*
     * The fog, as one document per *device* rather than one per cell or
     * one for everybody.
     *
     * Per cell would make a thousand-cell walk a thousand writes. A
     * single shared document would be worse than either: two devices
     * would overwrite each other's walking, and a grow-only set that
     * last-write-wins can erase is not grow-only. Keyed by the client
     * id, each device owns its own document, a pull skips the one it
     * wrote, and the receiving side unions — which is the arrangement
     * `unionCells` exists for.
     *
     * The cost, stated because it is real: the payload carries the whole
     * set every time, so this document is rewritten on every exchange
     * and re-read by the other device on the one after. A year of
     * walking is a few thousand short strings. If that ever matters the
     * fix is a locally stored stamp of what was last pushed — not a
     * shared document.
     */
    ...(payload.exploredCells.length === 0
      ? []
      : [
          {
            path: COLLECTIONS.exploredCells,
            id: clientId,
            record: { cells: payload.exploredCells },
          },
        ]),
    // Under a fixed id, so a second push overwrites rather than
    // accumulating settings blobs nobody will read.
    ...(payload.settings === undefined
      ? []
      : [{ path: COLLECTIONS.settings, id: SETTINGS_DOCUMENT, record: payload.settings }]),
    // The same, for the same reason. One resume, one document.
    ...(payload.resume === undefined
      ? []
      : [{ path: COLLECTIONS.resume, id: SETTINGS_DOCUMENT, record: payload.resume }]),
  ]
}

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

      const pages = await Promise.all([
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
        readSince(root(COLLECTIONS.dailies), after),
        readSince(root(COLLECTIONS.vices), after),
        readSince(root(COLLECTIONS.finance), after),
        readSince(root(COLLECTIONS.campaigns), after),
        readSince(root(COLLECTIONS.attempts), after),
        readSince(root(COLLECTIONS.homes), after),
        readSince(root(COLLECTIONS.rooms), after),
        readSince(root(COLLECTIONS.exploredCells), after),
        readSince(root(COLLECTIONS.tombstones), after),
        readSince(root(COLLECTIONS.settings), after),
        readSince(root(COLLECTIONS.resume), after),
      ])

      /*
       * **Every** page, and the completeness is load-bearing.
       *
       * `reached` is the high-water mark of what actually came back, and a
       * collection left out of it cannot advance the cursor. That fails
       * safe — nothing is lost, because the records are still in the
       * payload and the next pull re-reads — but it fails permanently: if
       * the only thing that ever changes is a collection missing from
       * here, the cursor never moves and every pull re-reads from that
       * point, forever.
       *
       * **It is `pages` itself now, not a second list written beside it.**
       * Three collections were missing when the atlas was added; the list
       * was then repaired by hand and drifted again, and by the time this
       * was found `dailies`, `vices`, `weighIns` and `finance` were all
       * absent — on an app whose most-written record is a habit tick, so
       * the cursor sat wherever the last workout had put it and every
       * pull re-read everything after it. A hand-maintained copy of a
       * list that already exists will drift; the destructuring below
       * reads from the same array that produces the cursor, so a
       * collection cannot be in one and not the other.
       */
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
        dailies,
        vices,
        finance,
        campaigns,
        attempts,
        homes,
        rooms,
        cells,
        tombstones,
        settings,
        resume,
      ] = pages

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
      const latestResume = resume.records[resume.records.length - 1]

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
          dailies: dailies.records as readonly Daily[],
          vices: vices.records as readonly Vice[],
          finance: finance.records as readonly FinanceReading[],
          campaigns: campaigns.records as readonly Campaign[],
          attempts: attempts.records as readonly Attempt[],
          homes: homes.records as readonly HomeCandidate[],
          rooms: rooms.records as readonly Room[],
          exploredCells: cells.records.flatMap(
            (record) => (record as { cells?: readonly string[] }).cells ?? [],
          ),
          tombstones: tombstones.records as readonly Tombstone[],
          ...(latestSettings === undefined ? {} : { settings: latestSettings as SyncedSettings }),
          ...(latestResume === undefined ? {} : { resume: latestResume as Resume }),
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
      const operations = pushOperations(payload, clientId)

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
