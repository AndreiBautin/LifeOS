import { isCategoryId } from './category-registry'
import { isPlausibleDailyGoal, isPlausibleProgressEntry } from './daily-goal'
import type { Item } from './item'
import { isPriority } from './priority'
import { isStatus } from './status'

export const ITEM_ENVELOPE_VERSION = 1

/**
 * Resource limits on anything parsed from outside the app — a restored
 * backup file, or LocalStorage a user could have hand-edited. Neither
 * source is trusted, and a browser tab has no other backstop: without a
 * cap, a 500 MB file is a frozen tab rather than an error message.
 */
export const MAX_ENVELOPE_BYTES = 5 * 1024 * 1024
export const MAX_ENVELOPE_ITEMS = 10_000

/**
 * Keys that let a crafted JSON payload reach `Object.prototype` when the
 * parsed object is later spread or assigned. `JSON.parse` keeps them as
 * own properties rather than acting on them, so they are harmless until
 * something copies them onward — which `normalizeItem` does. Stripping
 * them here means nothing downstream has to remember to.
 */
const POLLUTING_KEYS = ['__proto__', 'constructor', 'prototype'] as const

export interface ItemEnvelope {
  readonly version: number
  readonly items: readonly Item[]
}

interface RawEnvelopeShape {
  version: number
  items: unknown[]
}

function isEnvelopeShape(value: unknown): value is RawEnvelopeShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    'items' in value &&
    Array.isArray((value as { items: unknown }).items)
  )
}

/**
 * Whether a parsed value is close enough to an `Item` to keep.
 *
 * The closed-value-set fields are checked against their registries, not
 * merely `typeof === 'string'`: a `category` of `"not-a-category"` is
 * well-typed JSON but would reach `getCategoryDefinition`, which throws.
 * Validating at the boundary is what lets every layer above it treat
 * `CategoryId` as the guarantee its type claims to be.
 */
export function isPlausibleItem(value: unknown): value is Item {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Record<keyof Item, unknown>>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.title === 'string' &&
    typeof candidate.category === 'string' &&
    isCategoryId(candidate.category) &&
    typeof candidate.status === 'string' &&
    isStatus(candidate.status) &&
    typeof candidate.priority === 'string' &&
    isPriority(candidate.priority) &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every((tag) => typeof tag === 'string') &&
    typeof candidate.favorite === 'boolean' &&
    typeof candidate.dateAdded === 'string' &&
    /*
     * The change stamp may be absent, and an absent one is not a defect.
     * The repository writes it on save, so a record can legitimately
     * arrive here without one — from an export taken before the field
     * existed, or from a device that has not written it yet. Lift's merge
     * already has an answer for that case: no stamp loses to any
     * tombstone, because it cannot prove it is newer. Rejecting the record
     * outright would throw away a real item to avoid a comparison that is
     * already decided.
     */
    (candidate.updatedAt === undefined || typeof candidate.updatedAt === 'string')
  )
}

/**
 * Repairs the daily-goal fields of an otherwise-plausible item, translates
 * the old app's change stamp, and drops prototype-polluting keys.
 *
 * Backlogs saved before daily goals existed carry neither field, so a
 * missing log becomes an empty one here rather than an
 * undefined-is-not-iterable crash later; a malformed goal or log entry is
 * dropped on its own instead of taking the whole item down with it.
 *
 * **`lastUpdated` becomes `updatedAt`**, which is the one translation that
 * has to happen for the migration to be worth anything. Every file the old
 * app exported spells the stamp its own way, and an item arriving with no
 * `updatedAt` is not merely untidy: `changedSince` sends only records that
 * carry a stamp, so an entire imported backlog would sit on one device and
 * never reach the other — the failure looking exactly like a sync that
 * runs, reports success, and moves nothing.
 */
function normalizeItem(item: Item): Item {
  const raw = item as unknown as Record<string, unknown>
  const rawProgress = raw.dailyProgress
  const legacyStamp = raw.lastUpdated

  const { dailyGoal: storedGoal, ...withoutGoal } = item
  void storedGoal

  const safe = { ...withoutGoal } as Record<string, unknown>
  for (const key of [...POLLUTING_KEYS, 'lastUpdated']) {
    if (Object.hasOwn(safe, key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete safe[key]
    }
  }

  if (item.updatedAt === undefined && typeof legacyStamp === 'string') {
    safe.updatedAt = legacyStamp
  }

  return {
    ...(safe as unknown as Omit<Item, 'dailyGoal'>),
    dailyProgress: Array.isArray(rawProgress) ? rawProgress.filter(isPlausibleProgressEntry) : [],
    ...(isPlausibleDailyGoal(raw.dailyGoal) && { dailyGoal: raw.dailyGoal }),
  }
}

/** The shape shared by both the LocalStorage envelope and the user-facing export file. */
export function createItemEnvelope(items: readonly Item[]): ItemEnvelope {
  return { version: ITEM_ENVELOPE_VERSION, items: [...items] }
}

export interface ParsedItemEnvelope {
  readonly items: Item[]
  readonly warning: string | null
  /** How many entries were rejected — safe to log, unlike the entries themselves. */
  readonly droppedCount: number
  /**
   * True once raw JSON parsed and had the { version, items[] } shape, even
   * if individual items inside were dropped or the list is empty. False
   * means raw wasn't recognizable as an envelope at all — callers should
   * treat that as "nothing usable was found," not "the backlog is now
   * empty," and must not use `items` to overwrite existing data.
   */
  readonly envelopeValid: boolean
}

function rejected(warning: string): ParsedItemEnvelope {
  return { items: [], warning, droppedCount: 0, envelopeValid: false }
}

/** Parses raw JSON into a validated item list, never throwing — corruption is reported via `warning`. */
export function parseItemEnvelope(raw: string): ParsedItemEnvelope {
  // Measured before parsing: rejecting a hostile payload is only useful
  // if it happens before the expensive step, not after.
  if (raw.length > MAX_ENVELOPE_BYTES) {
    return rejected('File is too large (limit 5 MB)')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return rejected('Invalid JSON')
  }

  if (!isEnvelopeShape(parsed)) {
    return rejected('Unexpected data shape')
  }

  if (parsed.items.length > MAX_ENVELOPE_ITEMS) {
    return rejected('Too many items (limit 10,000)')
  }

  const validItems = parsed.items.filter(isPlausibleItem).map(normalizeItem)
  const droppedCount = parsed.items.length - validItems.length
  const warning = droppedCount > 0 ? `Dropped ${droppedCount.toString()} malformed item(s)` : null

  return { items: validItems, warning, droppedCount, envelopeValid: true }
}
