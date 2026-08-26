import { describe, expect, it } from 'vitest'

import { CATEGORY_REGISTRY } from '@/domain/backlog/category-registry'

import { CATEGORY_ICONS } from './category-icons'

describe('CATEGORY_ICONS', () => {
  it('has an icon for every registered category', () => {
    for (const category of CATEGORY_REGISTRY) {
      expect(CATEGORY_ICONS[category.id]).toBeDefined()
    }
  })
})
