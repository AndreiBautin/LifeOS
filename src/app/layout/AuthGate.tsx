import { LogIn, ShieldX } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

import { useServices } from '@/app/context'
import { Button, Card } from '@/components/shared/primitives'
import { readAccessConfig } from '@/config/access'
import { decideAccess } from '@/domain/access/gate'
import { useAccount, useSignIn, useSignOut, useSyncConfig } from '@/features/sync/useSync'

/**
 * The gate in front of every screen.
 *
 * The ask: *"is there a way to lock access to this app behind only my
 * account?"* — so this is an allowlist rather than a check that somebody
 * is signed in at all, which would admit anybody with a Google account.
 *
 * **It wraps the whole shell rather than each route**, including
 * Settings. A refused account therefore cannot reach the sign-out
 * control that lives there, which is why the refusal screen carries its
 * own: sending the wrong account back to a Sign in button is a loop,
 * because the browser hands Google the session it already has and
 * arrives straight back here.
 *
 * **What it is not.** It is not a lock on the phone — a session persists
 * on purpose, so anybody holding the unlocked device opens straight
 * through. It is not what protects the synced data either; that is
 * `firestore.rules`, which pinned every document to one account long
 * before this existed. What it buys is that the app stops being usable
 * by whoever finds the page, which is the demo posture the ask retires.
 */

const access = readAccessConfig()

function Curtain({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm text-center">{children}</Card>
    </div>
  )
}

export function AuthGate({ children }: { readonly children: ReactNode }) {
  const config = useSyncConfig()
  const { account, ready } = useAccount()
  const services = useServices()
  const signIn = useSignIn()
  const signOut = useSignOut()

  /*
   * **The one place the account reaches the repositories.**
   *
   * They were built at startup, before sign-in could possibly have
   * resolved, and read this holder per call rather than taking a uid —
   * so this is where the answer arrives. It runs in an effect because it
   * is a write to something outside React, and until it has run
   * `decideAccess` is still holding every screen back.
   *
   * Signing out clears it, which matters: left set, the next reader
   * would go on writing to the account that just left.
   */
  useEffect(() => {
    services.account?.set(account?.uid)
  }, [services.account, account?.uid])

  const decision = decideAccess({
    /*
     * A build that cannot authenticate cannot gate. With no Firebase
     * project there is no sign-in to offer, so a gate here would be a
     * locked door with no key — which is exactly the local development
     * build, and the one that must keep working.
     */
    gated: access.kind === 'restricted' && config.kind === 'configured',
    /*
     * **The store decides this, not the gate.** Once the records live in
     * Firestore there is no local database behind this screen, so
     * rendering the app signed-out would put every repository in front
     * of a call that can only throw.
     */
    requiresAccount: services.account !== undefined,
    ready,
    uid: account?.uid,
    allowed: access.kind === 'restricted' ? access.allowed : [],
  })

  if (decision.kind === 'open' || decision.kind === 'allowed') return children

  /*
   * Checking says nothing rather than guessing. A persisted session
   * takes a moment to resolve and this is every launch, so a "Sign in"
   * screen flashed here would be most of what the app feels like.
   */
  if (decision.kind === 'checking') {
    return (
      <Curtain>
        <p className="text-ink-500 text-sm">Checking your account…</p>
      </Curtain>
    )
  }

  if (decision.kind === 'refused') {
    return (
      <Curtain>
        <ShieldX size={28} className="text-bad-500 mx-auto mb-3" aria-hidden />
        <h1 className="text-ink-50 mb-1 text-lg font-semibold">Not this account</h1>
        <p className="text-ink-500 mb-4 text-sm">
          This install is locked to one account, and it is not the one you are signed in with.
        </p>
        {/*
          Sign out, never "try again". The browser would hand Google the
          session it already has and land straight back on this screen.
        */}
        <Button
          variant="outline"
          full
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate()
          }}
        >
          Sign out
        </Button>
        <p className="text-ink-700 numeric mt-3 text-xs break-all">{decision.uid}</p>
      </Curtain>
    )
  }

  return (
    <Curtain>
      <LogIn size={28} className="text-accent-400 mx-auto mb-3" aria-hidden />
      <h1 className="text-ink-50 mb-1 text-lg font-semibold">LifeOS</h1>
      <p className="text-ink-500 mb-4 text-sm">Sign in to continue.</p>
      <Button
        variant="primary"
        full
        disabled={signIn.isPending}
        onClick={() => {
          signIn.mutate()
        }}
      >
        {signIn.isPending ? 'Signing in…' : 'Sign in with Google'}
      </Button>
      {signIn.isError && (
        <p role="alert" className="text-bad-500 mt-3 text-xs">
          That did not work. Check the connection and try again.
        </p>
      )}
    </Curtain>
  )
}
