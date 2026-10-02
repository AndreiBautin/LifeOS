import { Cloud, RefreshCw, Unplug } from 'lucide-react'
import { useId, useState, useSyncExternalStore } from 'react'

import { useServices, useSettings } from '@/app/context'
import { Button, Card, Section } from '@/components/shared/primitives'
import { holdsSampleData } from '@/domain/settings/settings'
import { useSampleData } from '@/features/backup/useSampleData'
import {
  DEFAULT_SYNC_PATH,
  type GitHubSyncConfig,
} from '@/infrastructure/storage/github-sync-store'

import { syncStore } from './sync-store'

/**
 * Connecting this device to the private repository it syncs through.
 *
 * Four fields and three buttons, and the instructions for making the
 * repository and the token sit beside them, because the setup is done
 * once per device and nobody remembers it the second time.
 *
 * **The token is written into this browser's own storage and nowhere
 * else** — not settings, not the backup, not the file it syncs. See
 * `STORAGE_KEYS.githubSync` for why that separation is load-bearing.
 */
const FIELD =
  'bg-ink-850 border-ink-800 text-ink-50 placeholder:text-ink-700 h-11 w-full rounded-xl border px-3 text-sm'
const LABEL = 'text-ink-500 mb-1 block text-xs font-medium tracking-wide uppercase'

export function SyncSection() {
  const { clock } = useServices()
  const sync = useSyncExternalStore(syncStore.subscribe, syncStore.get)
  const connected = sync.config

  const [owner, setOwner] = useState(connected?.owner ?? '')
  const [repo, setRepo] = useState(connected?.repo ?? '')
  const [path, setPath] = useState(connected?.path ?? DEFAULT_SYNC_PATH)
  const [token, setToken] = useState('')
  const ids = { owner: useId(), repo: useId(), path: useId(), token: useId() }

  const { settings } = useSettings()
  const sample = useSampleData()
  const sampleHere = holdsSampleData(settings)

  const canConnect =
    owner.trim() !== '' && repo.trim() !== '' && token.trim() !== '' && !sample.startFresh.isPending

  /*
   * **The sample is cleared before the first round, never after.** Sync
   * merges by record and cannot tell a generated session from a real one,
   * so once the sample has gone up it is in every device's history. A
   * fresh install of the demo build fills itself, which made this the
   * ordinary path for anyone adding a second device rather than an edge
   * case.
   */
  const connect = (config: GitHubSyncConfig) => {
    if (!sampleHere) {
      syncStore.connect(config)
      return
    }
    sample.startFresh.mutate(undefined, {
      onSuccess: () => {
        syncStore.connect(config)
      },
    })
  }

  return (
    <Section
      title="Sync across devices"
      description="Through a private GitHub repository of your own — free, and nothing of ours in between."
    >
      <Card className="space-y-4">
        {connected === undefined ? (
          <>
            <ol className="text-ink-300 list-decimal space-y-1 pl-5 text-xs">
              <li>Create a private repository on GitHub, for example “lifeos-data”.</li>
              <li>
                Create a fine-grained personal access token with access to that repository only, and
                the permission <span className="text-ink-100">Contents: Read and write</span>.
              </li>
              <li>Enter both below, on every device you use.</li>
            </ol>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block" htmlFor={ids.owner}>
                <span className={LABEL}>GitHub account</span>
                <input
                  id={ids.owner}
                  className={FIELD}
                  value={owner}
                  autoComplete="off"
                  onChange={(event) => {
                    setOwner(event.target.value)
                  }}
                />
              </label>
              <label className="block" htmlFor={ids.repo}>
                <span className={LABEL}>Repository</span>
                <input
                  id={ids.repo}
                  className={FIELD}
                  value={repo}
                  autoComplete="off"
                  onChange={(event) => {
                    setRepo(event.target.value)
                  }}
                />
              </label>
            </div>

            <label className="block" htmlFor={ids.token}>
              <span className={LABEL}>Access token</span>
              <input
                id={ids.token}
                type="password"
                className={FIELD}
                value={token}
                autoComplete="off"
                onChange={(event) => {
                  setToken(event.target.value)
                }}
              />
            </label>

            <label className="block" htmlFor={ids.path}>
              <span className={LABEL}>File in the repository</span>
              <input
                id={ids.path}
                className={FIELD}
                value={path}
                autoComplete="off"
                onChange={(event) => {
                  setPath(event.target.value)
                }}
              />
            </label>

            {sampleHere && (
              <p className="text-warn-500 text-xs" role="note">
                This device holds the sample data. Connecting deletes it first so it never reaches
                your sync file — anything you logged on top of it goes too.
              </p>
            )}

            <Button
              variant="primary"
              full
              disabled={!canConnect}
              onClick={() => {
                connect({
                  owner: owner.trim(),
                  repo: repo.trim(),
                  path: path.trim() === '' ? DEFAULT_SYNC_PATH : path.trim(),
                  token: token.trim(),
                })
                setToken('')
              }}
            >
              <Cloud size={16} aria-hidden />
              {sampleHere ? 'Clear sample and connect' : 'Connect and sync'}
            </Button>
          </>
        ) : (
          <>
            <p className="text-ink-300 text-sm">
              Syncing with{' '}
              <span className="text-ink-50 font-medium">
                {connected.owner}/{connected.repo}
              </span>{' '}
              on launch, on every page change and whenever the app comes back to the front.
            </p>

            <p
              className={sync.phase === 'error' ? 'text-bad-500 text-xs' : 'text-ink-500 text-xs'}
              role="status"
            >
              {sync.phase === 'syncing'
                ? 'Syncing…'
                : sync.phase === 'error'
                  ? (sync.message ?? 'Sync failed.')
                  : connected.lastSyncedAt === undefined
                    ? 'Not synced yet.'
                    : `Last synced ${describeAgo(connected.lastSyncedAt, clock.now())}.`}
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={sync.phase === 'syncing'}
                onClick={() => {
                  syncStore.request(true)
                }}
              >
                <RefreshCw size={16} aria-hidden />
                Sync now
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  syncStore.disconnect()
                }}
              >
                <Unplug size={16} aria-hidden />
                Disconnect
              </Button>
            </div>
          </>
        )}
      </Card>
    </Section>
  )
}

function describeAgo(iso: string, now: Date): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${String(minutes)} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${String(hours)} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${String(days)} day${days === 1 ? '' : 's'} ago`
}
