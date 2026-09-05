import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'

import type { Clock } from '@/domain/repositories/ports'

import { requireAccount, type AccountHolder } from './account-holder'

/**
 * One collection of records under an account, in Firestore.
 *
 * **Generic because the ports are.** Every record repository in this app
 * is the same eight methods over a store of things with an `id` — the
 * differences are the query helpers a few of them add on top, and those
 * compose over `all()`. Writing twenty of these by hand is twenty
 * chances to spell a collection name wrong.
 *
 * **No tombstones.** They exist in the IndexedDB world because a
 * deletion leaves nothing behind and a merge cannot tell "deleted" from
 * "never seen". With one authoritative copy the question does not arise:
 * a delete is a delete, and every device sees it on the next snapshot.
 * That is the single biggest thing this migration removes.
 *
 * **Writes are stamped here, reads are not touched.** `save` sets
 * `updatedAt`; `restoreMany` deliberately does not, because it is the
 * import path and stamping there would make every restored record the
 * newest thing in the database — the same rule the IndexedDB
 * repositories hold, for the same reason.
 */
/**
 * Anything with a stable key. Most records carry `id`; a finance reading
 * and a monthly snapshot are keyed by their `month`, which is why the
 * key is chosen by the caller rather than assumed here.
 */
export type StoredRecord = object

export interface FirestoreCollectionDeps {
  readonly firestore: Firestore
  readonly account: AccountHolder
  readonly clock: Clock
}

/**
 * Which field is the document id.
 *
 * **Wrong here is silent and total**: keying a collection by a field the
 * records do not carry files every row under `undefined` and leaves one
 * document where there should be hundreds. That is the shape of bug the
 * sync's own `KEYED_BY` map was introduced to make impossible, arriving
 * one layer down.
 */
export type IdOf<T> = (record: T) => string

/** The shape every record repository shares. Query helpers compose on top. */
export interface FirestoreCollection<T extends StoredRecord> {
  all(): Promise<readonly T[]>
  byId(id: string): Promise<T | undefined>
  save(record: T): Promise<void>
  saveMany(records: readonly T[]): Promise<void>
  restoreMany(records: readonly T[]): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
  count(): Promise<number>
}

/**
 * Firestore refuses `undefined` outright, and an optional field that has
 * never been set is exactly that.
 *
 * Dropped rather than written as `null`, because the two are different
 * on the way back: the domain types use optional properties under
 * `exactOptionalPropertyTypes`, where an absent key and one holding
 * `null` are not the same thing.
 */
function withoutUndefined<T>(record: T): T {
  return Object.fromEntries(
    Object.entries(record as Record<string, unknown>).filter(([, value]) => value !== undefined),
  ) as T
}

/** Firestore's own batch ceiling. A write of more than this is chunked. */
const BATCH_LIMIT = 500

export function createFirestoreCollection<T extends StoredRecord>(
  deps: FirestoreCollectionDeps,
  name: string,
  idOf: IdOf<T> = (record) => String((record as { id?: unknown }).id),
): FirestoreCollection<T> {
  const { firestore, account, clock } = deps
  const root = () => collection(firestore, 'users', requireAccount(account), name)
  const one = (id: string) => doc(firestore, 'users', requireAccount(account), name, id)

  async function writeAll(records: readonly T[], stamp: boolean): Promise<void> {
    for (let index = 0; index < records.length; index += BATCH_LIMIT) {
      const batch = writeBatch(firestore)

      for (const record of records.slice(index, index + BATCH_LIMIT)) {
        const value = stamp ? { ...record, updatedAt: clock.now().toISOString() } : record

        batch.set(one(idOf(record)), withoutUndefined(value))
      }

      await batch.commit()
    }
  }

  return {
    async all() {
      const snapshot = await getDocs(root())
      return snapshot.docs.map((document) => document.data() as T)
    },

    async byId(id: string) {
      const snapshot = await getDoc(one(id))
      return snapshot.exists() ? (snapshot.data() as T) : undefined
    },

    async save(record: T) {
      await setDoc(
        one(idOf(record)),
        withoutUndefined({ ...record, updatedAt: clock.now().toISOString() }),
      )
    },

    async saveMany(records: readonly T[]) {
      await writeAll(records, true)
    },

    async restoreMany(records: readonly T[]) {
      await writeAll(records, false)
    },

    async remove(id: string) {
      await deleteDoc(one(id))
    },

    async clear() {
      const snapshot = await getDocs(root())

      for (let index = 0; index < snapshot.docs.length; index += BATCH_LIMIT) {
        const batch = writeBatch(firestore)
        for (const document of snapshot.docs.slice(index, index + BATCH_LIMIT)) {
          batch.delete(document.ref)
        }
        await batch.commit()
      }
    },

    async count() {
      /*
       * `getCountFromServer` rather than reading the collection and
       * measuring it: a count of a thousand workouts should not be a
       * thousand document reads. It is billed as one read per batch of
       * a thousand.
       */
      const snapshot = await getCountFromServer(root())
      return snapshot.data().count
    },
  }
}
