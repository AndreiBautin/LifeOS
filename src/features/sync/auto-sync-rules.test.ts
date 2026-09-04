import { describe, expect, it } from 'vitest'

import { isLocalChange, mayExchange, SYNC_MUTATION_KEY } from './auto-sync-rules'

const ready = { wired: true, sessionOpen: false, syncing: false, online: true }

describe('when an unattended exchange may run', () => {
  it('runs when everything is ready', () => {
    expect(mayExchange(ready)).toBe(true)
  })

  /*
   * The rule this whole feature had to answer rather than overrule.
   * `useSync` made sync a button because a timer would fire mid-set; an
   * open session blocks every trigger, so it cannot.
   */
  it('never runs while a session is open', () => {
    expect(mayExchange({ ...ready, sessionOpen: true })).toBe(false)
  })

  it('waits for the exchange already running', () => {
    expect(mayExchange({ ...ready, syncing: true })).toBe(false)
  })

  it('does nothing with no project or nobody signed in', () => {
    expect(mayExchange({ ...ready, wired: false })).toBe(false)
  })

  it('does nothing offline', () => {
    expect(mayExchange({ ...ready, online: false })).toBe(false)
  })
})

describe('what counts as a local change', () => {
  it('counts a settled write', () => {
    expect(isLocalChange('success', ['dailies', 'complete'])).toBe(true)
  })

  it('counts a write with no key of its own', () => {
    expect(isLocalChange('success', undefined)).toBe(true)
  })

  /*
   * The loop this exists to prevent: an exchange is a mutation, so
   * without the key its own success schedules the next one, every few
   * seconds, for as long as the app is open — costing Firestore reads
   * continuously while looking exactly like sync working.
   */
  it('does not count the exchange itself', () => {
    expect(isLocalChange('success', SYNC_MUTATION_KEY)).toBe(false)
  })

  it('ignores a write that has not finished', () => {
    expect(isLocalChange('pending', ['dailies', 'complete'])).toBe(false)
  })

  it('ignores a write that failed', () => {
    expect(isLocalChange('error', ['dailies', 'complete'])).toBe(false)
  })
})
