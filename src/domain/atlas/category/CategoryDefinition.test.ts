import { describe, expect, it } from 'vitest'
import { createCategoryRegistry } from './CategoryDefinition'
import type { CategoryDefinition, CategoryId } from './CategoryDefinition'

const restaurants: CategoryDefinition = {
  id: 'restaurants' as CategoryId,
  label: 'Restaurants',
  icon: '🍔',
}
const bars: CategoryDefinition = { id: 'bars' as CategoryId, label: 'Bars', icon: '🍸' }

describe('createCategoryRegistry', () => {
  it('looks up a definition by id', () => {
    const registry = createCategoryRegistry([restaurants, bars])

    expect(registry.getById('restaurants' as CategoryId)).toEqual(restaurants)
  })

  it('returns undefined for an unknown id', () => {
    const registry = createCategoryRegistry([restaurants])

    expect(registry.getById('unknown' as CategoryId)).toBeUndefined()
  })

  it('reports whether an id is registered', () => {
    const registry = createCategoryRegistry([restaurants])

    expect(registry.has('restaurants' as CategoryId)).toBe(true)
    expect(registry.has('bars' as CategoryId)).toBe(false)
  })

  it('lists every registered definition', () => {
    const registry = createCategoryRegistry([restaurants, bars])

    expect(registry.list()).toEqual([restaurants, bars])
  })
})
