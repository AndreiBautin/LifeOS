import {
  buildBackup,
  parseBackup,
  serialiseBackup,
  type BackupRepositories,
  type ExportOptions,
} from '@/infrastructure/backup/backup-service'
import { mergeNewer, recordsFingerprint } from '@/infrastructure/backup/sync-merge'

import { GitHubSyncError, readFile, writeFile, type GitHubTarget } from './github-file'

/**
 * One round of sync with the file in the repository: read it, merge it in,
 * and write back what this device now holds — but only if that differs.
 *
 * **The backup is the payload, on purpose.** Its envelope, checksum,
 * collection table and tombstones are already built and tested for
 * moving a whole database through a file; a sync is that file going to a
 * repository instead of a Downloads folder, merged by `mergeNewer`
 * instead of the import's file-wins merge.
 *
 * **Nothing is written when nothing changed**, judged by
 * `recordsFingerprint`, which ignores order and settings. Without it
 * every page switch on either device would be a commit, and two devices
 * would trade identical files forever.
 *
 * **A refused write is a race, not an error.** The other device wrote
 * between this read and this write, so the round starts again from a
 * fresh read and merges what it missed. Three attempts is generous for
 * two devices one person uses.
 */
export interface SyncRun {
  readonly pulled: number
  readonly purged: number
  readonly uploaded: boolean
}

const ATTEMPTS = 3

export async function syncWithGitHub(
  target: GitHubTarget,
  repositories: BackupRepositories,
  options: ExportOptions,
  fetchFn: typeof fetch = fetch,
): Promise<SyncRun> {
  let pulled = 0
  let purged = 0

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const remote = await readFile(target, fetchFn)

    let remoteFingerprint: string | undefined
    if (remote !== undefined) {
      const parsed = parseBackup(remote.text)
      if (parsed.envelope === undefined) {
        /*
         * Refused rather than overwritten. A file that fails its checksum
         * is most likely a truncated write, and replacing it with this
         * device's copy would quietly discard whatever the other device
         * had that this one does not.
         */
        throw new GitHubSyncError(
          'unexpected',
          'The file in the repository is not a readable backup, so nothing was overwritten.',
        )
      }
      const merged = await mergeNewer(parsed.envelope, repositories)
      pulled += merged.pulled
      purged += merged.purged
      remoteFingerprint = recordsFingerprint(parsed.envelope.data)
    }

    const local = await buildBackup(repositories, options)
    if (remoteFingerprint === recordsFingerprint(local.data)) {
      return { pulled, purged, uploaded: false }
    }

    const outcome = await writeFile(
      target,
      serialiseBackup(local),
      remote?.sha,
      `LifeOS sync, ${options.now.toISOString()}`,
      fetchFn,
    )
    if (outcome === 'written') return { pulled, purged, uploaded: true }
  }

  throw new GitHubSyncError(
    'unexpected',
    'The other device kept writing at the same time. Try again.',
  )
}
