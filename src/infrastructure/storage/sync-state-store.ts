import type { SyncState, SyncStateRepository } from '@/domain/repositories/ports'
import { STORAGE_KEYS } from '@/config/storage-keys'

/**
 * Where this device is in its conversation with a sync target.
 *
 * In localStorage rather than IndexedDB, and for the same reason settings
 * are: it must survive the database being rebuilt. A device that loses
 * its history and keeps its cursor would sync forward from a watermark
 * covering records it no longer has, and quietly never get them back.
 * Losing the cursor is the safe failure — the next sync starts from the
 * beginning and re-reads everything, which is slow exactly once.
 *
 * Read totally. A malformed value degrades to "never synced", because a
 * corrupt cursor must not be able to stop the app opening, and starting
 * over is always a valid thing for a sync to do.
 */
export function createSyncStateStore(storage: Storage = localStorage): SyncStateRepository {
  return {
    get() {
      let raw: string | null

      try {
        raw = storage.getItem(STORAGE_KEYS.syncState)
      } catch {
        // Private browsing and blocked-storage modes throw on access
        // rather than returning null.
        return Promise.resolve(undefined)
      }

      if (raw === null) return Promise.resolve(undefined)

      try {
        const parsed: unknown = JSON.parse(raw)
        return Promise.resolve(parse(parsed))
      } catch {
        return Promise.resolve(undefined)
      }
    },

    save(state: SyncState) {
      try {
        storage.setItem(STORAGE_KEYS.syncState, JSON.stringify(state))
      } catch {
        /*
         * A full or blocked store is not a reason to fail the sync that
         * just succeeded. The records are already written; losing the
         * cursor means the next run re-reads more than it needed to,
         * which is the cheapest possible consequence.
         */
      }

      return Promise.resolve()
    },
  }
}

/**
 * Read as `unknown` and narrowed field by field.
 *
 * The stored value is untrusted input — it may have been written by an
 * older version of the app, or edited by hand. Asserting it is already a
 * `SyncState` is how a "validator" ends up checking conditions the
 * compiler has decided cannot fail.
 */
function parse(value: unknown): SyncState | undefined {
  if (typeof value !== 'object' || value === null) return undefined

  const bag = value as Record<string, unknown>

  // Spread conditionally rather than assigning `undefined`: under
  // `exactOptionalPropertyTypes` an absent field and a field explicitly
  // set to undefined are different, and only the first is meant.
  const state: {
    cursor?: string
    pushedThrough?: string
    lastSyncedAt?: string
  } = {}

  if (typeof bag.cursor === 'string') state.cursor = bag.cursor
  if (typeof bag.pushedThrough === 'string') state.pushedThrough = bag.pushedThrough
  if (typeof bag.lastSyncedAt === 'string') state.lastSyncedAt = bag.lastSyncedAt

  return state
}
