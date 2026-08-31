import { describe, expect, it } from 'vitest'

import { describePersistence, formatBytes } from './durability'

/*
 * `isInstalled` and `storageStatus` read browser APIs and are not tested
 * here — the suite runs without a `window`, and stubbing `matchMedia` to
 * assert it was called would test the stub. What is worth holding is the
 * sentence a person reads, which is pure.
 */
describe('describing storage durability', () => {
  /*
   * The reason this parameter exists. Safari refuses `persist()`
   * outright, so every iPhone reports best-effort — including one where
   * the app is on the Home Screen and therefore exempt from the
   * inactivity eviction that is the thing iOS actually does. Repeating
   * the generic advice there tells somebody to do what they have
   * already done, beside a warning badge, about the safest state the
   * platform offers.
   */
  it('does not tell an installed app to install itself', () => {
    expect(describePersistence('best-effort', true)).not.toMatch(/home screen/i)
    expect(describePersistence('best-effort', false)).toMatch(/home screen/i)
  })

  it('still says what can take the data on an installed app', () => {
    // Never a reassurance that it is safe: the state genuinely is
    // best-effort, and deliberate clearing defeats every state there is.
    expect(describePersistence('best-effort', true)).toMatch(/by hand/i)
  })

  it('defaults to the browser-tab wording', () => {
    expect(describePersistence('best-effort')).toBe(describePersistence('best-effort', false))
  })

  it('says the same thing about a granted origin either way', () => {
    // Persistent is persistent; being installed adds nothing to it, and
    // a second sentence would imply otherwise.
    expect(describePersistence('persisted', true)).toBe(describePersistence('persisted', false))
  })
})

describe('formatting bytes', () => {
  it('leaves a small number in bytes', () => {
    expect(formatBytes(512)).toBe('512 B')
  })

  it('carries one decimal below ten and none above', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(51_200)).toBe('50 KB')
  })

  it('stops at gigabytes', () => {
    expect(formatBytes(5 * 1024 ** 4)).toMatch(/GB$/)
  })
})
