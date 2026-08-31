import { describe, expect, it } from 'vitest'

import { decideAccess, parseAllowedUids, type AccessInput } from './gate'

function input(over: Partial<AccessInput> = {}): AccessInput {
  return { gated: true, ready: true, uid: 'owner', allowed: ['owner'], ...over }
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
