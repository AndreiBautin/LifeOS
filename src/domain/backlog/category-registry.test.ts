import { describe, expect, it } from 'vitest'

import { CATEGORY_REGISTRY, getCategoryDefinition, isCategoryId } from './category-registry'

describe('CATEGORY_REGISTRY', () => {
  /*
   * Two assertions where there was one, and the split is the point.
   *
   * This pinned the exact array, which conflated "the port dropped none
   * of the ten" — the thing genuinely worth guarding, since a category
   * lost in the port would orphan every item filed under it — with
   * "nobody may ever add one". Adding `articles` for the morning digest
   * failed it, and the failure said nothing about whether anything was
   * broken.
   *
   * The ported ten must all still be here. Beyond that the registry is
   * allowed to grow, and each addition still has to earn a row: a label,
   * an icon and an entry in `CATEGORY_ICONS`, which is a
   * `Record<CategoryId, …>` and therefore fails the build on its own.
   */
  it('still has every category the port arrived with', () => {
    const ids = CATEGORY_REGISTRY.map((category) => category.id)

    for (const required of [
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
    ]) {
      expect(ids).toContain(required)
    }
  })

  it('lists each category once', () => {
    const ids = CATEGORY_REGISTRY.map((category) => category.id)

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
