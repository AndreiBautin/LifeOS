import { describe, expect, it } from 'vitest'

import { readAccessConfig } from './access'

describe('reading the account list', () => {
  it('is open when the variable is unset', () => {
    expect(readAccessConfig({})).toEqual({ kind: 'open' })
  })

  it('is open when the variable is present but empty', () => {
    expect(readAccessConfig({ VITE_ALLOWED_UIDS: '  ' })).toEqual({ kind: 'open' })
  })

  it('restricts to the accounts named', () => {
    expect(readAccessConfig({ VITE_ALLOWED_UIDS: 'abc, def' })).toEqual({
      kind: 'restricted',
      allowed: ['abc', 'def'],
    })
  })
})
