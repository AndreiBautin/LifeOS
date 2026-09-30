import type { GitHubTarget } from '@/infrastructure/sync/github-file'

/**
 * Which repository this device syncs through, the token for it, and when
 * it last synced.
 *
 * Device-local, and parsed totally: a blob that is missing a field or is
 * not JSON reads as "not connected" rather than throwing at startup, which
 * is the one moment an app cannot recover from a bad read.
 */
export interface GitHubSyncConfig extends GitHubTarget {
  readonly lastSyncedAt?: string
}

export const DEFAULT_SYNC_PATH = 'lifeos-sync.json'

export function readGitHubSync(
  key: string,
  storage: Storage = localStorage,
): GitHubSyncConfig | undefined {
  try {
    const raw = storage.getItem(key)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const { owner, repo, path, token, lastSyncedAt } = parsed as Record<string, unknown>
    if (
      typeof owner !== 'string' ||
      typeof repo !== 'string' ||
      typeof token !== 'string' ||
      owner === '' ||
      repo === '' ||
      token === ''
    ) {
      return undefined
    }
    return {
      owner,
      repo,
      token,
      path: typeof path === 'string' && path !== '' ? path : DEFAULT_SYNC_PATH,
      ...(typeof lastSyncedAt === 'string' ? { lastSyncedAt } : {}),
    }
  } catch {
    return undefined
  }
}

export function saveGitHubSync(
  key: string,
  config: GitHubSyncConfig,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(key, JSON.stringify(config))
  } catch {
    // Storage refused: the connection lasts this session and is asked for
    // again next launch, which is the honest outcome of not being able to
    // write it down.
  }
}

export function clearGitHubSync(key: string, storage: Storage = localStorage): void {
  try {
    storage.removeItem(key)
  } catch {
    // Nothing stored is the state being asked for.
  }
}
