import type { BackupData, BackupEnvelope } from '@/domain/backup/envelope'
import { checksumOf } from '@/domain/backup/checksum'
import { indexTombstones, shouldAccept, tombstoneKey } from '@/domain/sync/tombstone'

import { COLLECTIONS, COLLECTION_KEYS, restoreCells, type BackupRepositories } from './collections'

/**
 * Merging the other device's copy into this one, for sync.
 *
 * **Not the file import's merge, and the difference is the whole reason
 * this exists.** The import writes every record in the file over the one
 * here — right for "restore this backup", wrong for two devices taking
 * turns, where it would let whichever copy was read last undo the other's
 * edits. Here the **newer edit wins**, compared on the `updatedAt` every
 * repository stamps on save, and a record only this side has is kept.
 *
 * **Deletions travel both ways.** The file's tombstones are adopted first
 * (so nothing it deleted is accepted), and then any record *here* that a
 * tombstone now covers is purged — without that second half a record
 * deleted on the phone would survive on the desktop forever, and be
 * pushed straight back up on the desktop's next sync.
 *
 * Walked ground merges by union, as everywhere else.
 */
export interface SyncMergeResult {
  /** Records taken from the other device, new or newer than ours. */
  readonly pulled: number
  /** Records removed here because the other device deleted them. */
  readonly purged: number
}

/** A missing stamp sorts before any real one, so it never wins a tie. */
function stampOf(row: unknown): string {
  return (row as { readonly updatedAt?: string }).updatedAt ?? ''
}

export async function mergeNewer(
  envelope: BackupEnvelope,
  repositories: BackupRepositories,
): Promise<SyncMergeResult> {
  const { data } = envelope

  if (data.tombstones !== undefined && data.tombstones.length > 0) {
    await repositories.tombstones.record(data.tombstones)
  }
  const index = indexTombstones(await repositories.tombstones.all())

  let pulled = 0
  let purged = 0

  for (const key of COLLECTION_KEYS) {
    const collection = COLLECTIONS[key]
    const name = collection.tombstoneCollection
    const local = await collection.local(repositories)
    const mine = new Map(local.map((row) => [collection.idOf(row), row]))

    const newer = collection.fromFile(data).filter((row) => {
      const id = collection.idOf(row)
      const accepted =
        name === undefined || shouldAccept(row as { readonly updatedAt?: string }, name, id, index)
      if (!accepted) return false
      const ours = mine.get(id)
      return ours === undefined || stampOf(row) > stampOf(ours)
    })

    if (newer.length > 0) {
      await collection.restore(repositories, newer)
      pulled += newer.length
    }

    if (name !== undefined && collection.purge !== undefined) {
      for (const row of local) {
        const id = collection.idOf(row)
        if (!shouldAccept(row as { readonly updatedAt?: string }, name, id, index)) {
          await collection.purge(repositories, id)
          purged += 1
        }
      }
    }
  }

  await restoreCells(repositories, data.exploredCells ?? [])

  return { pulled, purged }
}

/**
 * A fingerprint of the records alone, independent of order and settings.
 *
 * Two devices holding the same records must produce the same value, or
 * each would see the other's file as different on every sync and upload
 * a commit that changes nothing — two devices ping-ponging a no-op
 * forever. So every collection is sorted by id, tombstones by key and
 * cells by value, and the settings are left out: they are per-device by
 * design and would otherwise differ on every comparison.
 */
export function recordsFingerprint(data: BackupData): string {
  const sections = Object.fromEntries(
    COLLECTION_KEYS.map((key) => {
      const collection = COLLECTIONS[key]
      const rows = [...collection.fromFile(data)].sort((a, b) =>
        collection.idOf(a).localeCompare(collection.idOf(b)),
      )
      return [key, rows]
    }),
  )

  // One entry per record, the latest deletion — the same reading
  // `indexTombstones` takes, so a store holding a duplicate cannot make
  // two otherwise identical copies look different.
  const latest = new Map<string, string>()
  for (const one of data.tombstones ?? []) {
    const key = tombstoneKey(one.collection, one.id)
    const seen = latest.get(key)
    if (seen === undefined || one.deletedAt > seen) latest.set(key, one.deletedAt)
  }
  const tombstones = [...latest.entries()].sort(([a], [b]) => a.localeCompare(b))

  return checksumOf({
    sections,
    tombstones,
    exploredCells: [...(data.exploredCells ?? [])].sort(),
  })
}
