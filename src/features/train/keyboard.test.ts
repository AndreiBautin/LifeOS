import { describe, expect, it } from 'vitest'

import { keyActionFor, type KeyPress } from './keyboard'

const press = (key: string, extra: Partial<KeyPress> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  typing: false,
  ...extra,
})

describe('the player keys', () => {
  it('maps the keys to actions', () => {
    expect(keyActionFor(press('Enter'))).toBe('log')
    expect(keyActionFor(press('L'))).toBe('log')
    expect(keyActionFor(press('s'))).toBe('skip')
    expect(keyActionFor(press('ArrowRight'))).toBe('next')
    expect(keyActionFor(press('k'))).toBe('previous')
    expect(keyActionFor(press('?'))).toBe('help')
  })

  /* A weight field's own Enter must not log a set behind it. */
  it('does nothing while typing, except Escape', () => {
    expect(keyActionFor(press('Enter', { typing: true }))).toBeUndefined()
    expect(keyActionFor(press('Escape', { typing: true }))).toBe('close')
  })

  it("leaves another app's shortcuts alone", () => {
    expect(keyActionFor(press('s', { metaKey: true }))).toBeUndefined()
    expect(keyActionFor(press('l', { ctrlKey: true }))).toBeUndefined()
  })
})
