/**
 * Making the browser treat this data as worth keeping.
 *
 * Everything the app knows lives in one origin's storage, and browsers
 * reserve the right to clear that storage. There are two distinct threats
 * and only one of them can be defended against in code:
 *
 *   - **Automatic eviction under disk pressure.** Storage is "best-effort"
 *     by default and browsers evict least-recently-used origins when the
 *     disk fills. `navigator.storage.persist()` promotes the origin to
 *     "persistent", which exempts it. Chromium grants this silently for an
 *     installed PWA or a site with high engagement; Firefox prompts;
 *     Safari has no equivalent, though it does exempt an installed Home
 *     Screen web app from its own inactivity-based eviction.
 *
 *   - **The user clearing site data.** Nothing can prevent this, and no
 *     API reports it happening. "Clear cookies" in every mainstream
 *     browser is really "cookies and other site data", and it takes
 *     IndexedDB with it. This is why export exists and why the app asks
 *     the lifter to use it.
 *
 * The honest position is that persistence reduces the risk of *silent*
 * loss and does nothing about deliberate loss, so the app reports its
 * real status rather than implying the data is safe.
 */

export type PersistenceState =
  /** Granted: exempt from automatic eviction. */
  | 'persisted'
  /** Storage works, but the origin may be evicted under disk pressure. */
  | 'best-effort'
  /** The browser does not implement the Storage API. */
  | 'unsupported'

export interface StorageStatus {
  readonly state: PersistenceState
  readonly usageBytes?: number
  readonly quotaBytes?: number
  readonly percentUsed?: number
}

/**
 * Asks for persistent storage and reports what was granted.
 *
 * Safe to call on every start: where the permission is already held the
 * call resolves immediately, and where it will be refused it resolves
 * false rather than prompting repeatedly.
 */
export async function requestPersistence(): Promise<PersistenceState> {
  if (!supportsStorageApi()) return 'unsupported'

  try {
    if (await navigator.storage.persisted()) return 'persisted'
    const granted = await navigator.storage.persist()
    return granted ? 'persisted' : 'best-effort'
  } catch {
    return 'unsupported'
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  if (!supportsStorageApi()) return { state: 'unsupported' }

  try {
    const persisted = await navigator.storage.persisted()
    const estimate = await navigator.storage.estimate()

    const usageBytes = estimate.usage
    const quotaBytes = estimate.quota

    return {
      state: persisted ? 'persisted' : 'best-effort',
      ...(usageBytes !== undefined ? { usageBytes } : {}),
      ...(quotaBytes !== undefined ? { quotaBytes } : {}),
      ...(usageBytes !== undefined && quotaBytes !== undefined && quotaBytes > 0
        ? { percentUsed: Number(((usageBytes / quotaBytes) * 100).toFixed(2)) }
        : {}),
    }
  } catch {
    return { state: 'unsupported' }
  }
}

function supportsStorageApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    typeof navigator.storage.persist === 'function'
  )
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex] ?? 'GB'}`
}

/** Plain-language description of what the current state actually means. */
export function describePersistence(state: PersistenceState): string {
  switch (state) {
    case 'persisted':
      return 'Your data is marked as persistent, so the browser will not clear it automatically to reclaim space. Clearing site data by hand still removes it.'
    case 'best-effort':
      return 'Your data is stored, but the browser may clear it if the device runs low on space. Installing the app to your home screen usually earns persistent storage.'
    case 'unsupported':
      return 'This browser does not report storage durability. Your data is saved locally, but export a backup regularly.'
  }
}
