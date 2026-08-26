import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import { filterItems } from './filter-items'

describe('filterItems', () => {
  it('returns every item when no filters are given', () => {
    const items = [buildItem(), buildItem()]

    expect(filterItems(items, {})).toEqual(items)
  })

  it('filters by category', () => {
    const game = buildItem({ category: 'games' })
    const book = buildItem({ category: 'books' })

    expect(filterItems([game, book], { category: 'games' })).toEqual([game])
  })

  it('filters by status', () => {
    const backlog = buildItem({ status: 'backlog' })
    const completed = buildItem({ status: 'completed' })

    expect(filterItems([backlog, completed], { status: 'completed' })).toEqual([completed])
  })

  it('filters by priority', () => {
    const high = buildItem({ priority: 'high' })
    const low = buildItem({ priority: 'low' })

    expect(filterItems([high, low], { priority: 'high' })).toEqual([high])
  })

  it('filters by platform', () => {
    const steam = buildItem({ platform: 'Steam' })
    const switchItem = buildItem({ platform: 'Switch' })

    expect(filterItems([steam, switchItem], { platform: 'Steam' })).toEqual([steam])
  })

  it('filters by tags, requiring every selected tag to be present', () => {
    const both = buildItem({ tags: ['cozy', 'short'] })
    const onlyCozy = buildItem({ tags: ['cozy'] })
    const neither = buildItem({ tags: ['long'] })

    expect(filterItems([both, onlyCozy, neither], { tags: ['cozy', 'short'] })).toEqual([both])
  })

  it('searches by title, case-insensitively', () => {
    const zelda = buildItem({ title: 'The Legend of Zelda' })
    const mario = buildItem({ title: 'Super Mario' })

    expect(filterItems([zelda, mario], { searchQuery: 'zelda' })).toEqual([zelda])
  })

  it('searches notes and tags in addition to the title', () => {
    const byNotes = buildItem({ title: 'Item A', notes: 'a cozy farming sim' })
    const byTag = buildItem({ title: 'Item B', tags: ['roguelike'] })
    const neither = buildItem({ title: 'Item C' })

    const results = filterItems([byNotes, byTag, neither], { searchQuery: 'cozy' })
    expect(results).toEqual([byNotes])

    const tagResults = filterItems([byNotes, byTag, neither], {
      searchQuery: 'roguelike',
    })
    expect(tagResults).toEqual([byTag])
  })

  it('combines multiple filters with AND semantics', () => {
    const match = buildItem({ category: 'games', status: 'backlog', priority: 'high' })
    const wrongStatus = buildItem({
      category: 'games',
      status: 'completed',
      priority: 'high',
    })

    const results = filterItems([match, wrongStatus], {
      category: 'games',
      status: 'backlog',
      priority: 'high',
    })

    expect(results).toEqual([match])
  })

  it('returns an empty array when nothing matches', () => {
    const item = buildItem({ category: 'games' })

    expect(filterItems([item], { category: 'books' })).toEqual([])
  })
})
