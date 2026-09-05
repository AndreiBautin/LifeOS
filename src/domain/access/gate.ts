/**
 * Who is allowed to use this install.
 *
 * The ask: *"I feel like this is getting quite specialized. Is there a
 * way to lock access to this app behind only my account?"* — so the gate
 * is an **allowlist of accounts**, not merely "signed in". Signed-in-ness
 * alone would let anyone with a Google account open the app and use it,
 * which is not what was asked for.
 *
 * **What this actually protects, stated plainly, because it is easy to
 * overestimate.** The synced data was never exposed: `firestore.rules`
 * pins every document to one uid and has since sync was built, so a
 * stranger could not read or write it whatever this file does. The
 * device's own IndexedDB is not protected either — it belongs to
 * whoever holds the device, and a gate drawn in JavaScript does not
 * change that.
 *
 * What it does buy is that **the app stops being usable by whoever finds
 * it**. Before this, opening the deployed page gave anybody a complete
 * working application against their own storage. That was a deliberate
 * demo posture and the ask retires it.
 *
 * It is not a lock on the phone. A signed-in session persists, which is
 * the whole point of not having to sign in every morning — so anyone
 * holding the unlocked device opens straight through, exactly as before.
 */

export type Access =
  /** No gate on this build. See {@link decideAccess} for when. */
  | { readonly kind: 'open' }
  /** The account is not known yet. Not the same as signed out. */
  | { readonly kind: 'checking' }
  | { readonly kind: 'signed-out' }
  /** Signed in as somebody who is not on the list. */
  | { readonly kind: 'refused'; readonly uid: string }
  | { readonly kind: 'allowed' }

export interface AccessInput {
  /**
   * Whether this build can gate at all.
   *
   * False when no account list is configured, and **false is open**. A
   * gate that fails closed on a missing variable would brick the app
   * with no way back in — and there is nothing behind it that failing
   * closed would protect, since the synced data is held by the Firestore
   * rules and the local data by the device. Fail-open here is the
   * cheaper mistake, and the Settings screen says which state it is in
   * rather than leaving it to be guessed.
   */
  readonly gated: boolean
  /**
   * Whether the **store** needs an account, as opposed to the gate
   * wanting one.
   *
   * True once the records live in Firestore, and it is a different
   * question from `gated`: that one asks "may this person in", this one
   * asks "is there anything to show". With Firestore as the store there
   * is no local database to read, so rendering the app signed-out would
   * put every screen in front of repositories that can only throw —
   * which is why this cannot fail open the way `gated` deliberately
   * does. There is no data to expose by refusing, and an empty app that
   * looks like an account with no records is the failure this project
   * has already spent an afternoon on.
   */
  readonly requiresAccount: boolean
  /** Whether the account state has been read yet. */
  readonly ready: boolean
  readonly uid: string | undefined
  readonly allowed: readonly string[]
}

export function decideAccess({ gated, requiresAccount, ready, uid, allowed }: AccessInput): Access {
  if (!gated && !requiresAccount) return { kind: 'open' }

  /*
   * Checking, not signed out. A persisted session takes a moment to
   * resolve, and answering "signed out" in the meantime would flash a
   * sign-in screen at somebody who is already signed in — on every
   * single launch, which is most of what the app would feel like.
   */
  if (!ready) return { kind: 'checking' }
  if (uid === undefined) return { kind: 'signed-out' }

  /*
   * Signed in, and this build has no list to check against. The store
   * has what it needs, so there is nothing left to refuse on.
   */
  if (!gated) return { kind: 'allowed' }

  /*
   * Refused is its own state rather than a return to signed-out. Sending
   * the wrong account back to a Sign in button is a loop: the browser
   * hands Google the session it already has and arrives back here. The
   * only way out is signing out, so that has to be what the screen
   * offers.
   */
  return allowed.includes(uid) ? { kind: 'allowed' } : { kind: 'refused', uid }
}

/**
 * Parses an account list.
 *
 * Comma-separated, trimmed, blanks dropped — the shape a person types
 * into a deployment variable. Parsed totally like every other
 * configuration here: junk degrades to a shorter list rather than
 * throwing, and an entirely empty one reads as no gate.
 */
export function parseAllowedUids(raw: string | undefined): readonly string[] {
  if (raw === undefined) return []

  return raw
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '')
}
