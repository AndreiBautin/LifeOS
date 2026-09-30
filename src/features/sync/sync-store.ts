import { STORAGE_KEYS } from '@/config/storage-keys'
import {
  clearGitHubSync,
  readGitHubSync,
  saveGitHubSync,
  type GitHubSyncConfig,
} from '@/infrastructure/storage/github-sync-store'

/**
 * The sync's state, shared between the runner in the shell and the
 * Settings section that configures it.
 *
 * A module store rather than React state, because the two live in
 * different parts of the tree and one of them — the runner — has no
 * screen. `useSyncExternalStore` reads it; the snapshot object is replaced
 * only when something changed, which is what that hook requires.
 */
export type SyncPhase = 'off' | 'idle' | 'syncing' | 'error'

export interface SyncSnapshot {
  readonly config?: GitHubSyncConfig
  readonly phase: SyncPhase
  readonly message?: string
}

let snapshot: SyncSnapshot = initial()
const listeners = new Set<() => void>()
let requestHandler: ((force: boolean) => void) | undefined

function initial(): SyncSnapshot {
  const config = readGitHubSync(STORAGE_KEYS.githubSync)
  return config === undefined ? { phase: 'off' } : { config, phase: 'idle' }
}

function publish(next: SyncSnapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

export const syncStore = {
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  get: (): SyncSnapshot => {
    return snapshot
  },
  connect: (config: GitHubSyncConfig): void => {
    saveGitHubSync(STORAGE_KEYS.githubSync, config)
    publish({ config, phase: 'idle' })
    requestHandler?.(true)
  },
  disconnect: (): void => {
    clearGitHubSync(STORAGE_KEYS.githubSync)
    publish({ phase: 'off' })
  },
  phase: (phase: SyncPhase, message?: string): void => {
    publish({
      ...(snapshot.config === undefined ? {} : { config: snapshot.config }),
      phase,
      ...(message === undefined ? {} : { message }),
    })
  },
  synced: (at: string): void => {
    const config = snapshot.config
    if (config === undefined) return
    const next = { ...config, lastSyncedAt: at }
    saveGitHubSync(STORAGE_KEYS.githubSync, next)
    publish({ config: next, phase: 'idle' })
  },
  /** Asks the runner for a round; `force` skips the throttle. */
  request: (force: boolean): void => {
    requestHandler?.(force)
  },
  onRequest: (handler: ((force: boolean) => void) | undefined): void => {
    requestHandler = handler
  },
}
