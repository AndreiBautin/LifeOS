/**
 * What went wrong, said to a person rather than to a developer.
 *
 * Firebase reports failures as codes and terse English —
 * "Missing or insufficient permissions." — which is accurate and tells a
 * reader nothing about whether they have done something wrong, whether
 * the app is broken, or whether it is behaving exactly as intended.
 *
 * The permission case is the one that matters most here, and it is not an
 * error at all. This deployment's Firestore rules name a single account.
 * Anyone else can open the app, use every part of it, and sign in — and
 * their first sync is refused by design. Showing them a database error for
 * that is misleading; showing them the reason is honest and is a better
 * advertisement for the app than a green tick would be.
 *
 * Pure, and separate from the component, because the mapping is the part
 * worth testing and a component is the part that is not.
 */

export function describeSyncError(error: unknown): string {
  const code = codeOf(error)

  // An error with no code at all takes the same route as one whose code
  // nobody has handled: say what it said. Separated from the switch
  // because exhaustiveness checking is on, and `undefined` is a case
  // about the *shape* of the value rather than about a kind of failure.
  if (code === undefined) return rawMessage(error)

  switch (code) {
    case 'permission-denied':
    case 'firestore/permission-denied':
      return (
        'Sync on this deployment is limited to the owner’s account. ' +
        'Everything else works — your training is saved on this device, ' +
        'and the backup file in Your data is how it moves between devices.'
      )

    case 'unavailable':
    case 'firestore/unavailable':
      return 'Could not reach the server. Check your connection and try again.'

    case 'unauthenticated':
      return 'Your session expired. Sign out and back in.'

    case 'auth/unauthorized-domain':
      return 'This address is not on the project’s list of authorised domains, so sign-in was refused.'

    case 'auth/popup-blocked':
      // Reachable only if the redirect fallback also fails.
      return 'The browser blocked the sign-in window and the fallback did not start.'

    case 'auth/network-request-failed':
      return 'Sign-in could not reach Google. Check your connection.'

    case 'auth/cancelled-popup-request':
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.'

    default:
      // Deliberately the raw message. An unrecognised failure is one
      // nobody has thought about yet, and paraphrasing it into something
      // reassuring would hide the only evidence of what happened.
      return rawMessage(error)
  }
}

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

/**
 * Firebase puts the code on the error object rather than in its type, so
 * it is read as `unknown` and narrowed. Asserting the shape would be
 * claiming to know something about a value that arrived from a library's
 * error path.
 */
function codeOf(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}
