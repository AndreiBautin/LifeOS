import { createItemEnvelope, parseItemEnvelope } from '@/domain/backlog/item-envelope'
import type { BacklogItemRepository, TombstoneRepository } from '@/domain/repositories/ports'
import { indexTombstones, shouldAccept } from '@/domain/sync/tombstone'

/**
 * The one-way door the old Backlogs app comes through.
 *
 * Its export file is the migration route, deliberately: the alternative is
 * a schema step that would have to reach into another origin's
 * localStorage, which is both impossible from here and the wrong place to
 * put knowledge about an app that is being retired.
 *
 * The same path doubles as the ordinary export and import, because they
 * are the same file format and having two would mean two parsers.
 */

export interface TransferDeps {
  readonly items: BacklogItemRepository
  readonly tombstones: TombstoneRepository
}

export async function exportBacklog(deps: TransferDeps): Promise<string> {
  return JSON.stringify(createItemEnvelope(await deps.items.all()), null, 2)
}

/**
 * `merge` writes each record by id; `replace` empties the store first.
 *
 * Two named modes rather than one function with a flag, and the emptying
 * is `clear` on the repository rather than a mode inside `restoreMany`.
 * Backlogs had a single `replaceAll` doing both, which is how a call site
 * asking to fill an empty store can receive a wipe of a full one.
 */
export type BacklogImportMode = 'merge' | 'replace'

export interface BacklogImportResult {
  /** How many items were written. */
  readonly imported: number
  /** Recognised items refused because something here deleted them. */
  readonly rejected: number
  readonly warning: string | null
  /**
   * False when the input was not a recognisable envelope at all.
   *
   * Callers must not read this as "the backlog is now empty" — nothing was
   * written, and a file that failed to parse is not a claim about what
   * should be stored. Backlogs learned this one the hard way, which is why
   * the parser reports it rather than returning an empty list.
   */
  readonly envelopeValid: boolean
}

export async function importBacklog(
  raw: string,
  mode: BacklogImportMode,
  deps: TransferDeps,
): Promise<BacklogImportResult> {
  const { items, warning, envelopeValid } = parseItemEnvelope(raw)

  if (!envelopeValid) {
    return { imported: 0, rejected: 0, warning, envelopeValid: false }
  }

  /*
   * A merge respects this device's deletions; a replace does not have to,
   * because the store is being emptied and the file is the whole truth.
   *
   * Without the filter on merge, exporting a backup, deleting an item and
   * importing the backup brings the item back — counted as an addition,
   * because from the merge's point of view that is genuinely what it is.
   */
  const accepted =
    mode === 'replace'
      ? items
      : await (async () => {
          const index = indexTombstones(await deps.tombstones.all())
          return items.filter((item) => shouldAccept(item, 'items', item.id, index))
        })()

  if (mode === 'replace') await deps.items.clear()
  await deps.items.restoreMany(accepted)

  return {
    imported: accepted.length,
    rejected: items.length - accepted.length,
    warning,
    envelopeValid: true,
  }
}
