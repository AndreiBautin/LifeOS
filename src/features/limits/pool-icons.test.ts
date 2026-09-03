import { describe, expect, it } from 'vitest'

import { DEFAULT_POOL_ICON, POOL_ICONS, poolIcon } from './pool-icons'

describe('poolIcon', () => {
  it('uses the icon a pool chose', () => {
    expect(poolIcon('beer', 'Caffeine').id).toBe('beer')
  })

  /*
   * The bug this exists for. Every pool written before the icon field
   * drew the same flask, so two different substances wore one picture —
   * which reads as a repeated icon rather than as a default.
   */
  it('guesses from the name when nothing was chosen', () => {
    expect(poolIcon(undefined, 'Caffeine').id).toBe('coffee')
    expect(poolIcon(undefined, 'THC').id).toBe('leaf')
    expect(poolIcon(undefined, 'Alcohol').id).toBe('beer')
    expect(poolIcon(undefined, 'Water').id).toBe('droplet')
    expect(poolIcon(undefined, 'Vegetables').id).toBe('carrot')
  })

  it('matches on a substring, so a longer name still lands', () => {
    expect(poolIcon(undefined, 'Decaf coffee').id).toBe('coffee')
    expect(poolIcon(undefined, 'Morning hydration').id).toBe('droplet')
  })

  it('ignores case', () => {
    expect(poolIcon(undefined, 'KUSH').id).toBe('leaf')
  })

  /*
   * A guess must never overrule a decision. Somebody who picked the
   * lightning for their coffee meant it.
   */
  it('lets a chosen icon beat what the name suggests', () => {
    expect(poolIcon('bolt', 'Coffee').id).toBe('bolt')
  })

  it('falls back to the flask when the name suggests nothing', () => {
    expect(poolIcon(undefined, 'Screen time').id).toBe(DEFAULT_POOL_ICON)
    expect(poolIcon(undefined, '').id).toBe(DEFAULT_POOL_ICON)
    expect(poolIcon(undefined).id).toBe(DEFAULT_POOL_ICON)
  })

  it('never returns an icon with no path to draw', () => {
    for (const one of POOL_ICONS) expect(one.path.length).toBeGreaterThan(0)
    expect(poolIcon('nonsense', 'nonsense').path.length).toBeGreaterThan(0)
  })

  it('has no repeated id, since an id is what a pool stores', () => {
    const ids = POOL_ICONS.map((one) => one.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
