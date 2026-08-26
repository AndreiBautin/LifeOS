/**
 * A record of something having been deleted.
 *
 * Deleting a row removes it, which is the correct thing to do to a row
 * and the wrong thing to do to *knowledge*. The row's absence is
 * indistinguishable from its never having existed, and every mechanism
 * that merges two copies of this database reads that absence as "the
 * other copy knows something I don't" and puts the record back.
 *
 * That is already reachable today, without any sync at all: export a
 * backup, delete a session, import the backup in merge mode, and the
 * session returns — counted as an *addition*, because from the merge's
 * point of view that is exactly what it is. Under a phone-and-desktop
 * sync it stops being a corner case and becomes the normal outcome of
 * deleting anything.
 *
 * A tombstone is the missing half: not "this row is absent" but "this row
 * was deleted, at this time, deliberately". It is small, it is
 * append-only, and it is the only thing that lets a merge tell a deletion
 * apart from a gap.
 */

/** The collections a tombstone can refer to. */
export const TOMBSTONED_COLLECTIONS = [
  'exercises',
  'workouts',
  'checkIns',
  'items',
  'projects',
  'upgrades',
] as const

export type TombstonedCollection = (typeof TOMBSTONED_COLLECTIONS)[number]

export interface Tombstone {
  /** The id of the record that was deleted. */
  readonly id: string
  readonly collection: TombstonedCollection
  /** ISO timestamp of the deletion. */
  readonly deletedAt: string
}

/** The key a tombstone is stored and looked up under. */
export function tombstoneKey(collection: TombstonedCollection, id: string): string {
  return `${collection}:${id}`
}

export interface TombstoneIndex {
  /** When this record was deleted, if it was. */
  deletedAt(collection: TombstonedCollection, id: string): string | undefined
}

export function indexTombstones(tombstones: readonly Tombstone[]): TombstoneIndex {
  const byKey = new Map<string, string>()

  for (const tombstone of tombstones) {
    const key = tombstoneKey(tombstone.collection, tombstone.id)
    const existing = byKey.get(key)

    // Newest wins. Two devices can each delete the same record, and the
    // later timestamp is the one a re-creation would have to beat.
    if (existing === undefined || tombstone.deletedAt > existing) {
      byKey.set(key, tombstone.deletedAt)
    }
  }

  return {
    deletedAt: (collection, id) => byKey.get(tombstoneKey(collection, id)),
  }
}

/**
 * Whether an incoming record should be written, given what has been
 * deleted locally.
 *
 * The comparison is against the record's own `updatedAt` rather than
 * against nothing, so a deletion does not become permanent. Delete a
 * workout on the phone, edit that same workout on the desktop before the
 * two have spoken, and the edit — being later than the deletion — wins.
 * That is the right way round: a deletion is a statement about the record
 * as it stood, not a claim on every future version of it.
 *
 * A record with no `updatedAt` is treated as older than any tombstone.
 * Records written before this existed cannot prove they are newer, and
 * assuming they are would resurrect exactly what the tombstone was added
 * to prevent.
 */
export function shouldAccept(
  record: { readonly updatedAt?: string },
  collection: TombstonedCollection,
  id: string,
  tombstones: TombstoneIndex,
): boolean {
  const deletedAt = tombstones.deletedAt(collection, id)
  if (deletedAt === undefined) return true
  if (record.updatedAt === undefined) return false

  return record.updatedAt > deletedAt
}
