import { STORAGE_KEYS } from '@/config/storage-keys'

/**
 * What there is to spend right now, in minor units.
 *
 * Device-local and never synced, which is a decision rather than an
 * omission: it is not a fact about the tree, it is the question you ask
 * the tree, and the answer changes hourly. Syncing it would mean a phone's
 * guess overwriting a desktop's with neither being wrong — the same reason
 * the program position stays local.
 *
 * Zero when absent or unreadable. A budget nobody has set is not a claim
 * that everything is affordable.
 */
export function readUpgradeBudget(storage: Storage = localStorage): number {
  try {
    const raw = storage.getItem(STORAGE_KEYS.upgradeBudget)
    if (raw === null) return 0

    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : 0
  } catch {
    return 0
  }
}

export function writeUpgradeBudget(minorUnits: number, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEYS.upgradeBudget, String(Math.max(0, Math.round(minorUnits))))
  } catch {
    // A blocked quota costs a remembered number, not data.
  }
}
