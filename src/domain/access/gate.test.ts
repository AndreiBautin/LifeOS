import { describe, expect, it } from 'vitest'

import { decideAccess, parseAllowedUids, type AccessInput } from './gate'

function input(over: Partial<AccessInput> = {}): AccessInput {
  return {
    gated: true,
    requiresAccount: false,
    ready: true,
    uid: 'owner',
    allowed: ['owner'],
    ...over,
  }
}

describe('deciding access', () => {
  it('lets the owner in', () => {
    expect(decideAccess(input()).kind).toBe('allowed')
  })

  it('asks anybody else to sign out rather than to sign in', () => {
    const access = decideAccess(input({ uid: 'somebody-else' }))

    expect(access).toEqual({ kind: 'refused', uid: 'somebody-else' })
  })

  it('refuses an account that is not on the list even when the list is long', () => {
    expect(decideAccess(input({ uid: 'c', allowed: ['a', 'b'] })).kind).toBe('refused')
  })

  it('reports signed out when nobody is signed in', () => {
    expect(decideAccess(input({ uid: undefined })).kind).toBe('signed-out')
  })

  /*
   * The one that decides what every launch feels like. A persisted
   * session takes a moment to resolve, and answering "signed out" in the
   * meantime flashes a sign-in screen at somebody already signed in.
   */
  it('is checking rather than signed out before the account is known', () => {
    expect(decideAccess(input({ ready: false, uid: undefined })).kind).toBe('checking')
  })

  /*
   * Fail-open, deliberately. A gate that failed closed on a missing
   * variable would brick the app with no way back in, and there is
   * nothing behind it that failing closed would protect — the synced
   * data is held by the Firestore rules and the local data by the
   * device.
   */
  it('is open when no list is configured', () => {
    expect(decideAccess(input({ gated: false, uid: undefined, allowed: [] })).kind).toBe('open')
  })

  it('does not check an account at all when the build is ungated', () => {
    expect(decideAccess(input({ gated: false, uid: 'somebody-else' })).kind).toBe('open')
  })
})

describe('parsing an account list', () => {
  it('reads a comma-separated list', () => {
    expect(parseAllowedUids('a,b')).toEqual(['a', 'b'])
  })

  it('trims and drops blanks, because that is how a person types one', () => {
    expect(parseAllowedUids(' a , , b ,')).toEqual(['a', 'b'])
  })

  it('reads nothing at all as no gate', () => {
    expect(parseAllowedUids(undefined)).toEqual([])
    expect(parseAllowedUids('   ')).toEqual([])
    expect(parseAllowedUids(',,')).toEqual([])
  })
})

/*
 * `requiresAccount` is a different question from `gated`: that one asks
 * whether this person may come in, this one asks whether there is
 * anything to show them. It arrived with Firestore as the store, where
 * a signed-out app has no local database behind it — so unlike `gated`,
 * which fails open on purpose, this one cannot.
 */
describe('when the store itself needs an account', () => {
  it('holds the app back while the account is still resolving', () => {
    expect(
      decideAccess(input({ gated: false, requiresAccount: true, ready: false, uid: undefined }))
        .kind,
    ).toBe('checking')
  })

  it('asks for a sign-in even with no account list to check', () => {
    expect(
      decideAccess(input({ gated: false, requiresAccount: true, ready: true, uid: undefined }))
        .kind,
    ).toBe('signed-out')
  })

  it('lets a signed-in person through when there is no list', () => {
    expect(
      decideAccess(input({ gated: false, requiresAccount: true, ready: true, uid: 'anybody' }))
        .kind,
    ).toBe('allowed')
  })

  /*
   * The list still decides once the store is satisfied — a signed-in
   * account that is not on it is refused, not admitted.
   */
  it('still refuses an account the list does not name', () => {
    expect(decideAccess(input({ gated: true, requiresAccount: true, uid: 'stranger' })).kind).toBe(
      'refused',
    )
  })

  /*
   * The local build: no project, so no store that needs an account and
   * no list to check. It has to keep working with no sign-in at all.
   */
  it('stays open when neither the gate nor the store wants an account', () => {
    expect(decideAccess(input({ gated: false, requiresAccount: false })).kind).toBe('open')
  })
})
