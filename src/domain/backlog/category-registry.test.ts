import { describe, expect, it } from 'vitest'

import { CATEGORY_REGISTRY, getCategoryDefinition, isCategoryId } from './category-registry'

describe('CATEGORY_REGISTRY', () => {
  it('contains the ten spec-required categories exactly once each', () => {
    const ids = CATEGORY_REGISTRY.map((category) => category.id)

    expect(ids).toEqual([
      'games',
      'tv-shows',
      'movies',
      'anime',
      'books',
      'manga',
      'podcasts',
      'music',
      'youtube',
      'courses',
    ])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every category a non-empty label and icon', () => {
    for (const category of CATEGORY_REGISTRY) {
      expect(category.label.length).toBeGreaterThan(0)
      expect(category.icon.length).toBeGreaterThan(0)
    }
  })
})

describe('getCategoryDefinition', () => {
  it('returns the matching definition for a known id', () => {
    expect(getCategoryDefinition('games')).toEqual(
      expect.objectContaining({ id: 'games', label: 'Games' }),
    )
  })
})

describe('isCategoryId', () => {
  it('accepts every registered category id', () => {
    for (const category of CATEGORY_REGISTRY) {
      expect(isCategoryId(category.id)).toBe(true)
    }
  })

  it('rejects an unknown string', () => {
    expect(isCategoryId('not-a-category')).toBe(false)
  })
})

describe('suggestedGoalUnit', () => {
  it('gives every category a unit a daily goal can be counted in', () => {
    for (const category of CATEGORY_REGISTRY) {
      expect(category.suggestedGoalUnit.length).toBeGreaterThan(0)
    }
  })

  it('suggests the unit each medium is actually consumed in', () => {
    expect(getCategoryDefinition('books').suggestedGoalUnit).toBe('chapter')
    expect(getCategoryDefinition('tv-shows').suggestedGoalUnit).toBe('episode')
    expect(getCategoryDefinition('games').suggestedGoalUnit).toBe('level')
  })
})
