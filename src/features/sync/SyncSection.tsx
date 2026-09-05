import { Badge, Button, Card, Section } from '@/components/shared/primitives'

import { describeSyncError } from './describe-error'

import { readAccessConfig } from '@/config/access'
import { useAccount, useSignIn, useSignOut, useSyncConfig } from './useSync'

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
  const signIn = useSignIn()
  const signOut = useSignOut()

  if (config.kind === 'absent') {
    return (
      <Section title="Sync">
        <Card>
          <p className="text-ink-300 text-sm">
            This build has no account configured, so everything is stored on this device alone. The
            backup file in the section above is the only way anything moves off it.
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

  return (
    <Section title="Account" description="Where your records live.">
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink-50 text-sm font-medium">
              {account === undefined ? 'Not signed in' : (account.email ?? 'Signed in')}
            </p>
            {/*
              **No "last synced" any more, because there is no moment
              to name.** Records are read from and written to the
              account directly, so the only question is whether you
              are signed in — which the line above answers.
            */}
            <p className="text-ink-500 mt-0.5 text-xs">
              {account === undefined ? 'Sign in to reach your records' : 'Records live here'}
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

        {signIn.error !== null && (
          <p className="text-bad-500 text-xs">{describeSyncError(signIn.error)}</p>
        )}

        {/*
          **There is nothing to press any more.** Every record is read
          from and written to Firestore directly, so both devices are
          looking at the same thing rather than at two copies being
          reconciled — the exchange, the cursor and the tombstones are
          all gone with it.

          What stays on each device is what genuinely differs: where you
          are in the block, and the preferences a phone and a desktop
          should disagree about.
        */}
        <p className="text-ink-500 text-xs">
          Your records live in the account above, so every device signed in to it sees the same
          thing. Where you are in the training block stays on each device deliberately — it is the
          one thing two devices cannot agree on by comparing timestamps.
        </p>
      </Card>
    </Section>
  )
}
