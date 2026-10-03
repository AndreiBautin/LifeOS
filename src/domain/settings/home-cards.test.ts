import { describe, expect, it } from 'vitest'

import { arrangeCards, moveCard, toggleCard } from './home-cards'

const DEFAULTS = ['session', 'week', 'standards', 'history']

describe('the home cards', () => {
  it('are the defaults until somebody arranges them', () => {
    expect(arrangeCards(DEFAULTS, undefined)).toEqual(DEFAULTS)
  })

  it('follow a saved order and leave hidden cards out', () => {
    const prefs = { order: ['history', 'session', 'week', 'standards'], hidden: ['week'] }
    expect(arrangeCards(DEFAULTS, prefs)).toEqual(['history', 'session', 'standards'])
  })

  /* A card shipped after the order was saved must not vanish. */
  it('slot a new card in after its default neighbour, and drop a retired one', () => {
    const prefs = { order: ['history', 'session', 'retired', 'standards'], hidden: [] }
    expect(arrangeCards(DEFAULTS, prefs)).toEqual(['history', 'session', 'week', 'standards'])
  })

  it('move one place and stop at the ends', () => {
    expect(moveCard(DEFAULTS, undefined, 'week', -1).order).toEqual([
      'week',
      'session',
      'standards',
      'history',
    ])
    expect(moveCard(DEFAULTS, undefined, 'session', -1).order).toEqual(DEFAULTS)
  })

  it('toggle hidden both ways', () => {
    const hidden = toggleCard(undefined, DEFAULTS, 'week')
    expect(hidden.hidden).toEqual(['week'])
    expect(toggleCard(hidden, DEFAULTS, 'week').hidden).toEqual([])
  })
})
