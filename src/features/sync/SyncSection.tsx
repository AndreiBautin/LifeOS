import { RefreshCw } from 'lucide-react'

import { Badge, Button, Card, Section } from '@/components/shared/primitives'

import { describeSyncError } from './describe-error'

import { readAccessConfig } from '@/config/access'
import {
  useAccount,
  useSignIn,
  useSignOut,
  useSyncConfig,
  useSyncNow,
  useSyncState,
} from './useSync'

/**
 * Sync, said plainly enough to be trusted.
 *
 * The hardest thing to communicate here is that nothing is happening
 * automatically, because every other app that syncs does it silently and
 * a lifter will reasonably assume this one does too. Someone who believes
 * their phone is uploading, and finds out three weeks later that it was
 * not, has lost three weeks — so the screen states the position rather
 * than implying it.
 */
const access = readAccessConfig()

export function SyncSection() {
  const config = useSyncConfig()
  const { account, ready } = useAccount()
  const state = useSyncState()

  const signIn = useSignIn()
  const signOut = useSignOut()
  const syncNow = useSyncNow(account)

  if (config.kind === 'absent') {
    return (
      <Section title="Sync">
        <Card>
          <p className="text-ink-300 text-sm">
            This build has no sync configured. Everything stays on this device, which is how the app
            has always worked — the backup file in the section above is how your training moves
            between devices.
          </p>
        </Card>
      </Section>
    )
  }

  if (config.kind === 'incomplete') {
    return (
      <Section title="Sync">
        <Card className="space-y-2">
          <Badge tone="warn">Misconfigured</Badge>
          <p className="text-ink-300 text-sm">
            Some Firebase settings are present and some are missing, so sync is off rather than half
            on. Missing: <span className="text-ink-50">{config.missing.join(', ')}</span>.
          </p>
        </Card>
      </Section>
    )
  }

  const lastSynced = state.data?.lastSyncedAt

  return (
    <Section title="Sync" description="Between this device and your other one.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink-50 text-sm font-medium">
              {account === undefined ? 'Not signed in' : (account.email ?? 'Signed in')}
            </p>
            <p className="text-ink-500 numeric mt-0.5 text-xs">
              {lastSynced === undefined
                ? 'Never synced'
                : `Last synced ${new Date(lastSynced).toLocaleString()}`}
            </p>
          </div>

          {!ready ? null : account === undefined ? (
            <Button
              variant="outline"
              disabled={signIn.isPending}
              onClick={() => {
                signIn.mutate()
              }}
            >
              {signIn.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          ) : (
            <Button
              variant="ghost"
              disabled={signOut.isPending}
              onClick={() => {
                signOut.mutate()
              }}
            >
              Sign out
            </Button>
          )}
        </div>

        {/*
          Whether the gate is on, stated rather than left to be guessed.

          It fails open on a missing account list — a gate that bricked
          the app for want of a variable would be worse than no gate — so
          "off" is a state somebody can arrive in without meaning to. A
          lock nobody can see is a lock nobody can trust.
        */}
        <p className="text-ink-700 border-ink-800 border-t pt-3 text-xs">
          {access.kind === 'restricted'
            ? `This build is locked to ${access.allowed.length === 1 ? 'one account' : `${String(access.allowed.length)} accounts`}. Anyone else signing in is refused.`
            : 'This build has no account list, so anyone signed in can use it. Your synced data is still locked to your account by the database rules.'}
        </p>

        {account !== undefined && (
          <Button
            variant="primary"
            full
            disabled={syncNow.isPending}
            onClick={() => {
              syncNow.mutate()
            }}
          >
            <RefreshCw size={16} aria-hidden />
            {syncNow.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        )}

        {/*
          The result is reported in records rather than as "done".
          "Sent 0, received 12" is checkable against what you expected;
          a tick is not, and a tick over a sync that silently did nothing
          is exactly the failure worth catching early.
        */}
        {syncNow.data !== undefined && (
          <p className="text-ink-300 numeric text-xs">
            Sent {syncNow.data.pushed} · received {syncNow.data.received}
            {syncNow.data.rejected > 0 && ` · ${String(syncNow.data.rejected)} already deleted`}
          </p>
        )}

        {syncNow.error !== null && (
          <p className="text-bad-500 text-xs">{describeSyncError(syncNow.error)}</p>
        )}

        {signIn.error !== null && (
          <p className="text-bad-500 text-xs">{describeSyncError(signIn.error)}</p>
        )}

        <p className="text-ink-500 text-xs">
          This syncs on its own — when the other device writes, when you come back to this one, and
          after anything you change here. Never mid-session: an open workout stops it, which is what
          this button is still for. Your position in the block stays on each device deliberately: it
          is the one thing two devices cannot agree on by comparing timestamps.
        </p>
      </Card>
    </Section>
  )
}
