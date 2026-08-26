import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import { sortItems } from './sort-items'

describe('sortItems', () => {
  it('sorts by recently-added, newest first', () => {
    const older = buildItem({ title: 'Old', dateAdded: '2026-01-01T00:00:00.000Z' })
    const newer = buildItem({ title: 'New', dateAdded: '2026-02-01T00:00:00.000Z' })

    expect(sortItems([older, newer], 'recently-added').map((i) => i.title)).toEqual(['New', 'Old'])
  })

  it('sorts alphabetically, case-insensitively', () => {
    const banana = buildItem({ title: 'banana' })
    const Apple = buildItem({ title: 'Apple' })
    const cherry = buildItem({ title: 'cherry' })

    expect(sortItems([banana, Apple, cherry], 'alphabetical').map((i) => i.title)).toEqual([
      'Apple',
      'banana',
      'cherry',
    ])
  })

  it('sorts by priority, high first', () => {
    const low = buildItem({ title: 'Low', priority: 'low' })
    const high = buildItem({ title: 'High', priority: 'high' })
    const someday = buildItem({ title: 'Someday', priority: 'someday' })

    expect(sortItems([low, high, someday], 'priority').map((i) => i.title)).toEqual([
      'High',
      'Low',
      'Someday',
    ])
  })

  it('sorts by recently-completed, newest first, with never-completed items last', () => {
    const finishedEarlier = buildItem({
      title: 'Earlier',
      status: 'completed',
      dateCompleted: '2026-01-01T00:00:00.000Z',
    })
    const finishedLater = buildItem({
      title: 'Later',
      status: 'completed',
      dateCompleted: '2026-02-01T00:00:00.000Z',
    })
    const neverFinished = buildItem({ title: 'Never', status: 'backlog' })

    const sorted = sortItems([finishedEarlier, neverFinished, finishedLater], 'recently-completed')

    expect(sorted.map((i) => i.title)).toEqual(['Later', 'Earlier', 'Never'])
  })

  it('sorts by recently-updated, newest first', () => {
    const stale = buildItem({ title: 'Stale', updatedAt: '2026-01-01T00:00:00.000Z' })
    const fresh = buildItem({ title: 'Fresh', updatedAt: '2026-02-01T00:00:00.000Z' })

    expect(sortItems([stale, fresh], 'recently-updated').map((i) => i.title)).toEqual([
      'Fresh',
      'Stale',
    ])
  })

  it('does not mutate the input array', () => {
    const items = [buildItem({ title: 'B' }), buildItem({ title: 'A' })]
    const original = [...items]

    sortItems(items, 'alphabetical')

    expect(items).toEqual(original)
  })
})
