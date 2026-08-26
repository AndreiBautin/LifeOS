import { describe, expect, it } from 'vitest'

import { describeSyncError } from './describe-error'

function firebaseError(code: string, message = 'raw message'): Error {
  return Object.assign(new Error(message), { code })
}

describe('explaining a sync failure', () => {
  it('treats a refused write as intended behaviour, not a fault', () => {
    // The demo case. Someone who is not the owner signs in, syncs, and is
    // refused by the rules — which is the system working. Showing them
    // "Missing or insufficient permissions" would read as a broken app.
    const text = describeSyncError(firebaseError('permission-denied'))

    expect(text).toContain('owner')
    expect(text).not.toContain('permission')
    expect(text).toContain('Everything else works')
  })

  it('separates being offline from being refused', () => {
    expect(describeSyncError(firebaseError('unavailable'))).toContain('connection')
  })

  it('names an unauthorised domain, which is otherwise baffling', () => {
    // Fails on the deployed site while working on localhost. Without
    // naming it, that combination looks like the app is broken.
    expect(describeSyncError(firebaseError('auth/unauthorized-domain'))).toContain(
      'authorised domains',
    )
  })

  it('does not dress up a failure nobody has considered', () => {
    // An unrecognised code is the one case where the raw message is the
    // only evidence of what happened; paraphrasing it hides that.
    expect(describeSyncError(firebaseError('some/new-code', 'Quota exceeded'))).toBe(
      'Quota exceeded',
    )
  })

  it('copes with things that are not errors at all', () => {
    expect(describeSyncError(undefined)).toBe('Something went wrong.')
    expect(describeSyncError('a string')).toBe('Something went wrong.')
    expect(describeSyncError({ code: 42 })).toBe('Something went wrong.')
  })
})
