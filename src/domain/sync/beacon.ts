/**
 * The one document a device stamps so the other device knows to sync.
 *
 * The beacon carries no payload and is not a record. It says only
 * "somebody wrote", which is the cheapest true thing a watcher can
 * report — the exchange already knows how to work out *what* changed, so
 * this decides **when** and never what syncing means.
 */

export interface BeaconSighting {
  /** Firestore's local echo, before the server has confirmed the write. */
  readonly hasPendingWrites: boolean
  /** The device that stamped it, absent if the document does not exist. */
  readonly by?: string | undefined
}

/**
 * Whether a beacon sighting is another device and worth an exchange.
 *
 * **Three things are skipped and each is this device hearing itself.**
 * A pending write is our own push before the server has it; a confirmed
 * write carrying our own client id is the same push a moment later; and
 * a missing document is the first snapshot on an account nobody has
 * pushed from, which is not a change.
 *
 * This is a pure function with a test because it fails **silently** in
 * both directions. Too strict and the feature quietly does nothing, so
 * the app is back to polling and nobody can tell. Too loose and every
 * push wakes the device that made it, which syncs, which pushes — a loop
 * that costs reads continuously and looks exactly like sync working.
 */
export function isRemoteBeacon(sighting: BeaconSighting, clientId: string): boolean {
  if (sighting.hasPendingWrites) return false
  if (sighting.by === undefined) return false

  return sighting.by !== clientId
}
