import { describe, expect, it } from 'vitest'

import { installOffer } from './install'

const BASE = {
  installed: false,
  dismissed: false,
  hasTrained: true,
  canPrompt: true,
  ios: false,
}

describe('offering to install', () => {
  it('uses the browser dialog where there is one', () => {
    expect(installOffer(BASE)).toBe('prompt')
  })

  it('explains the Share sheet on iOS, which has no dialog', () => {
    expect(installOffer({ ...BASE, canPrompt: false, ios: true })).toBe('ios')
  })

  /* A button that does nothing is worse than no card. */
  it('stays quiet where the browser offers no way', () => {
    expect(installOffer({ ...BASE, canPrompt: false })).toBe('none')
  })

  it('never asks once installed, dismissed, or before any training', () => {
    expect(installOffer({ ...BASE, installed: true })).toBe('none')
    expect(installOffer({ ...BASE, dismissed: true })).toBe('none')
    expect(installOffer({ ...BASE, hasTrained: false })).toBe('none')
  })
})
