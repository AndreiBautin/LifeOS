import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

import type { FirebaseConfig } from '@/config/firebase'

/**
 * The one place a Firebase client is constructed.
 *
 * Built once and reused. Calling `initializeApp` twice with the same name
 * throws, and doing it from two components is the standard way this ends
 * up as a startup crash rather than a sync that quietly does not work.
 *
 * Nothing here runs unless a project is configured *and* the lifter has
 * asked to sign in. An install with no project never constructs any of
 * it, which is what keeps "no sync" identical to how the app behaved
 * before sync existed.
 */

export interface FirebaseClient {
  readonly app: FirebaseApp
  readonly auth: Auth
  readonly db: Firestore
}

let client: FirebaseClient | undefined

export function firebaseClient(config: FirebaseConfig): FirebaseClient {
  if (client !== undefined) return client

  const app = initializeApp(config)
  client = { app, auth: getAuth(app), db: getFirestore(app) }

  return client
}

export interface SignedInAccount {
  readonly uid: string
  readonly email?: string
  readonly displayName?: string
}

export function accountOf(user: User | null): SignedInAccount | undefined {
  if (user === null) return undefined

  return {
    uid: user.uid,
    ...(user.email !== null ? { email: user.email } : {}),
    ...(user.displayName !== null ? { displayName: user.displayName } : {}),
  }
}

export function watchAccount(
  auth: Auth,
  onChange: (account: SignedInAccount | undefined) => void,
): () => void {
  return onAuthStateChanged(auth, (user) => {
    onChange(accountOf(user))
  })
}

/**
 * Google sign-in: a popup, falling back to a redirect when the popup is
 * refused.
 *
 * The popup is preferred because a redirect reloads the page, and losing
 * your place is the failure this app is most designed against. But
 * "preferred" was doing too much work in the first version, which used a
 * popup and nothing else — the first real attempt returned
 * `auth/popup-blocked`, and the screen offered a Sign in button that
 * could not sign anyone in. An installed PWA on iOS is the case where
 * this is most likely and least recoverable.
 *
 * So: popup first, redirect only when the browser has actually refused.
 * Not on `popup-closed-by-user` — that is someone changing their mind,
 * and navigating them away for it would be the opposite of what they
 * asked for.
 *
 * Undefined means the redirect has started and the page is on its way
 * out; the account arrives through {@link completeRedirectSignIn} on the
 * way back in.
 */
const REDIRECT_WHEN = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

export async function signIn(auth: Auth): Promise<SignedInAccount | undefined> {
  const provider = new GoogleAuthProvider()

  try {
    const credential = await signInWithPopup(auth, provider)
    return accountOf(credential.user)
  } catch (error: unknown) {
    const code = error instanceof Error ? (error as { code?: string }).code : undefined
    if (code === undefined || !REDIRECT_WHEN.has(code)) throw error

    await signInWithRedirect(auth, provider)
    return undefined
  }
}

/**
 * Picks up a sign-in that finished by redirect.
 *
 * Called on load. Returns nothing on an ordinary load, which is the
 * common case — a redirect result exists only on the one navigation that
 * comes back from Google. A failure here is reported rather than thrown:
 * an app that will not start because a sign-in attempt went wrong three
 * navigations ago is worse than one that says you are signed out.
 */
export async function completeRedirectSignIn(auth: Auth): Promise<SignedInAccount | undefined> {
  try {
    const credential = await getRedirectResult(auth)
    return credential === null ? undefined : accountOf(credential.user)
  } catch {
    return undefined
  }
}

export function signOutOf(auth: Auth): Promise<void> {
  return signOut(auth)
}

/**
 * A stable id for this device.
 *
 * Not the account: two devices share an account, and the whole reason
 * this exists is so a device can tell its own writes apart from the other
 * one's. Persisted, because a value regenerated on every load would make
 * a device collect everything it had ever written back from the server.
 */
export function deviceId(storage: Storage, key: string, generate: () => string): string {
  try {
    const existing = storage.getItem(key)
    if (existing !== null && existing !== '') return existing

    const created = generate()
    storage.setItem(key, created)
    return created
  } catch {
    /*
     * Blocked storage. A per-session id is wrong but survivable: the
     * device collects its own writes back once, rewrites identical
     * records over themselves, and carries on. Refusing to sync at all
     * would be the worse answer.
     */
    return generate()
  }
}
