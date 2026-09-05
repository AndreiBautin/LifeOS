/**
 * Which account the repositories are reading and writing under.
 *
 * **A holder rather than a constructor argument, because of when things
 * happen.** `bootstrap()` builds every repository once at startup, and
 * sign-in resolves a moment later — so a uid passed at construction
 * would always be the one that was not known yet. Reading it per call
 * keeps one set of repositories for the life of the app and lets the
 * answer arrive late.
 *
 * It is deliberately not a React thing. The repositories live in
 * infrastructure and must not learn that a component tree exists; what
 * they need is a value that can change, which is the smallest possible
 * object.
 */
export interface AccountHolder {
  /** The signed-in uid, or `undefined` before anybody has signed in. */
  current(): string | undefined
  set(uid: string | undefined): void
}

export function createAccountHolder(): AccountHolder {
  let uid: string | undefined

  return {
    current: () => uid,
    set: (next) => {
      uid = next
    },
  }
}

/**
 * The uid, or a refusal that says which of the two states this is.
 *
 * **Throwing beats returning empty**, and the alternative is worse than
 * it looks: a repository that silently read `users/undefined/...` would
 * work, return nothing, and look exactly like an account with no data —
 * which is the failure this app has already spent an afternoon on.
 *
 * Nothing should ever reach this. `AuthGate` wraps the whole shell, so
 * no screen that queries anything renders before the account is known.
 * It is here for the case where that stops being true.
 */
export function requireAccount(holder: AccountHolder): string {
  const uid = holder.current()
  if (uid === undefined) {
    throw new Error('No account is signed in, so there is nothing to read or write.')
  }

  return uid
}
