import { parseAllowedUids } from '@/domain/access/gate'

/**
 * Which accounts this build lets in, if it restricts them at all.
 *
 * One variable, `VITE_ALLOWED_UIDS`, holding Firebase account ids. Unset
 * is the ordinary local state and means no gate — see `decideAccess` for
 * why this fails open rather than closed.
 *
 * **A uid is not a secret and this variable is public**, like every other
 * `VITE_` value. It names an account; it authorises nothing. Knowing the
 * owner's uid does not let anybody sign in as them, and the synced data
 * is held by `firestore.rules` regardless of what this says. Do not go
 * looking for a secret to put here.
 *
 * The uid is deliberately **the same string that appears in
 * `firestore.rules`**, and that duplication is real: the rules file
 * cannot be read from the bundle and the bundle cannot be read by
 * Firestore, so one fact is stated in two places. If they disagree, the
 * gate and the database disagree about who the owner is — the symptom is
 * an account that can open the app and cannot sync.
 */

export type AccessConfig =
  /** No account list configured. The app is unrestricted. */
  { readonly kind: 'open' } | { readonly kind: 'restricted'; readonly allowed: readonly string[] }

/**
 * Read from a plain bag rather than `import.meta.env` directly, so the
 * parsing is testable without a bundler — the same arrangement
 * `readFirebaseConfig` uses and for the same reason.
 */
export function readAccessConfig(
  env: Record<string, string | undefined> = import.meta.env,
): AccessConfig {
  const allowed = parseAllowedUids(env.VITE_ALLOWED_UIDS)

  return allowed.length === 0 ? { kind: 'open' } : { kind: 'restricted', allowed }
}
