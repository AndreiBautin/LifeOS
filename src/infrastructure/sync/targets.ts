import type { SyncTarget } from '@/domain/repositories/ports'
import { EMPTY_PAYLOAD, isEmpty, type SyncPayload } from '@/domain/sync/payload'

/**
 * Sync targets that need no network.
 *
 * One inert and one in-memory. Between them they are what lets the
 * exchange in `synchronise` be written, tested and shipped before any
 * decision has been made about where the data actually goes — which is
 * the point of the port existing at all.
 */

/**
 * A target that accepts everything and returns nothing.
 *
 * The default until a backend is chosen. Syncing against it is a no-op
 * that leaves the database exactly as it was, so the feature can be wired
 * end to end and demonstrably do nothing, rather than existing as an
 * unreachable branch nobody has run.
 */
export function createNullSyncTarget(): SyncTarget {
  return {
    name: 'None',
    pull(cursor: string | undefined) {
      // Handed straight back. A target issuing a new cursor on every pull
      // would make the stored state churn for no reason, and hide whether
      // anything had actually moved.
      return Promise.resolve({ payload: EMPTY_PAYLOAD, cursor: cursor ?? '0' })
    },
    push() {
      return Promise.resolve()
    },
  }
}

/**
 * A shared log standing in for whatever ends up holding the data.
 *
 * An ordered list of batches, which is the one property a real backend
 * must supply and this app cannot fake: an ordering the *target* owns.
 * Every alternative involves comparing timestamps written by different
 * devices, and two clocks that disagree by a minute will silently hide a
 * minute of the other device's work.
 */
export interface MemorySyncServer {
  readonly batches: { readonly from: string; readonly payload: SyncPayload }[]
}

export function createMemorySyncServer(): MemorySyncServer {
  return { batches: [] }
}

/**
 * One device's view of a {@link MemorySyncServer}.
 *
 * Two of these over one server is exactly the shape of a phone and a
 * desktop, and is how the exchange is tested without a network or a
 * second browser.
 */
export function createMemorySyncTarget(server: MemorySyncServer, clientId: string): SyncTarget {
  return {
    name: `Memory (${clientId})`,

    /*
     * A client never receives its own writes back.
     *
     * Not a nicety. `synchronise` pushes before it pulls, so without this
     * every exchange would hand the device the batch it had just sent —
     * writing byte-identical records over themselves and reporting them
     * as received. Harmless and completely misleading, which is the worst
     * combination in a report someone uses to decide whether sync works.
     *
     * A real backend solves this the same way, by knowing who wrote what.
     * Keeping it inside the implementation rather than in the port means
     * a backend that handles echo differently is free to.
     */
    pull(cursor: string | undefined) {
      const parsed = cursor === undefined ? 0 : Number.parseInt(cursor, 10)
      const start = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0

      const mine = server.batches.slice(start).filter((batch) => batch.from !== clientId)

      /*
       * The newest settings among the batches read, not all of them.
       * Settings are one blob rather than a collection, so concatenating
       * is meaningless — the last one wins, exactly as a real backend
       * storing them under a single document would give back whatever was
       * written most recently.
       */
      const settings = mine.reduce<SyncPayload['settings']>(
        (latest, batch) => batch.payload.settings ?? latest,
        undefined,
      )

      /* The other singleton, on exactly the same terms. */
      const resume = mine.reduce<SyncPayload['resume']>(
        (latest, batch) => batch.payload.resume ?? latest,
        undefined,
      )

      return Promise.resolve({
        payload: {
          exercises: mine.flatMap((batch) => batch.payload.exercises),
          workouts: mine.flatMap((batch) => batch.payload.workouts),
          checkIns: mine.flatMap((batch) => batch.payload.checkIns),
          items: mine.flatMap((batch) => batch.payload.items),
          projects: mine.flatMap((batch) => batch.payload.projects),
          upgrades: mine.flatMap((batch) => batch.payload.upgrades),
          metrics: mine.flatMap((batch) => batch.payload.metrics),
          reviews: mine.flatMap((batch) => batch.payload.reviews),
          places: mine.flatMap((batch) => batch.payload.places),
          trips: mine.flatMap((batch) => batch.payload.trips),
          dailies: mine.flatMap((batch) => batch.payload.dailies),
          vices: mine.flatMap((batch) => batch.payload.vices),
          finance: mine.flatMap((batch) => batch.payload.finance),
          campaigns: mine.flatMap((batch) => batch.payload.campaigns),
          attempts: mine.flatMap((batch) => batch.payload.attempts),
          challenges: mine.flatMap((batch) => batch.payload.challenges),
          homes: mine.flatMap((batch) => batch.payload.homes),
          rooms: mine.flatMap((batch) => batch.payload.rooms),
          exploredCells: mine.flatMap((batch) => batch.payload.exploredCells),
          tombstones: mine.flatMap((batch) => batch.payload.tombstones),
          ...(settings === undefined ? {} : { settings }),
          ...(resume === undefined ? {} : { resume }),
        },
        // Past everything read, including this client's own batches —
        // they were skipped deliberately, not left for later.
        cursor: String(server.batches.length),
      })
    },

    push(payload: SyncPayload) {
      // An empty push is not recorded. Appending it advances every other
      // client's cursor past a batch containing nothing, which is
      // harmless and makes cursor arithmetic in a test unreadable.
      if (!isEmpty(payload)) server.batches.push({ from: clientId, payload })
      return Promise.resolve()
    },
  }
}
