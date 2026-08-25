import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
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
 * Google sign-in, by popup.
 *
 * A popup rather than a redirect because a redirect reloads the page,
 * and this app can be mid-session — a set logged and not yet written
 * would survive, but the open workout screen would not, and losing your
 * place between sets is the exact failure the whole app is designed
 * against. A blocked popup is a visible error the lifter can act on; an
 * unexpected reload is not.
 */
export async function signIn(auth: Auth): Promise<SignedInAccount | undefined> {
  const provider = new GoogleAuthProvider()
  const credential = await signInWithPopup(auth, provider)

  return accountOf(credential.user)
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
