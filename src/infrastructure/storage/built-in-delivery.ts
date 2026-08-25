import { STORAGE_KEYS } from '@/config/storage-keys'

/**
 * A record of which built-in programs this install has already been given.
 *
 * Needed because "the database is missing built-in X" has two entirely
 * different causes and the same appearance:
 *
 *   1. X shipped in an update this install predates — it should be added.
 *   2. The lifter deleted X — it must stay deleted.
 *
 * Nothing in the database distinguishes them, so delivery is recorded
 * separately. An id present here has been offered once and will never be
 * offered again, whatever the lifter did with it afterwards.
 *
 * Two honest limits. An install created before this record existed has an
 * empty one, so a built-in deleted before then comes back exactly once and
 * then stays gone. And the record lives in `localStorage`, which the
 * browser clears alongside IndexedDB — but a lifter who has just lost
 * their whole database getting the shipped programs back is the right
 * outcome anyway.
 */

function parse(raw: string | null): ReadonlySet<string> {
  if (raw === null) return new Set()

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()

    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'))
  } catch {
    // A corrupt marker means "delivered nothing", which risks re-offering
    // a deleted built-in once. The alternative — treating it as "delivered
    // everything" — would permanently withhold programs from an install
    // that never received them, which is the worse failure.
    return new Set()
  }
}

export function readDeliveredBuiltIns(storage: Storage = localStorage): ReadonlySet<string> {
  try {
    return parse(storage.getItem(STORAGE_KEYS.deliveredBuiltIns))
  } catch {
    return new Set()
  }
}

/** Records ids as delivered, keeping any already recorded. */
export function recordDeliveredBuiltIns(
  ids: readonly string[],
  storage: Storage = localStorage,
): boolean {
  try {
    const merged = new Set([...readDeliveredBuiltIns(storage), ...ids])
    storage.setItem(STORAGE_KEYS.deliveredBuiltIns, JSON.stringify([...merged].sort()))
    return true
  } catch {
    // Private-mode Safari and a full quota both throw here. Failing to
    // record delivery is not worth blocking startup: the cost is that the
    // sync re-offers the same programs next start.
    return false
  }
}
