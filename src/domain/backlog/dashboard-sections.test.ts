import { describe, expect, it } from 'vitest'

import { buildItem } from '@/test/builders/backlog-item'

import { getDashboardSections } from './dashboard-sections'

describe('getDashboardSections', () => {
  it('puts currently-using items in continue, most recently updated first', () => {
    const stale = buildItem({
      title: 'Stale',
      status: 'currently-using',
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    const fresh = buildItem({
      title: 'Fresh',
      status: 'currently-using',
      updatedAt: '2026-02-20T00:00:00.000Z',
    })
    const backlog = buildItem({ title: 'Not started', status: 'backlog' })

    const sections = getDashboardSections([stale, fresh, backlog])

    expect(sections.continue.map((i) => i.title)).toEqual(['Fresh', 'Stale'])
  })

  it('puts one backlog item per category in startNext, ordered by priority then age', () => {
    const gameLow = buildItem({
      title: 'Low priority game',
      category: 'games',
      status: 'backlog',
      priority: 'low',
      dateAdded: '2026-01-01T00:00:00.000Z',
    })
    const bookHighNewer = buildItem({
      title: 'High book, newer',
      category: 'books',
      status: 'backlog',
      priority: 'high',
      dateAdded: '2026-02-01T00:00:00.000Z',
    })
    const movieHighOlder = buildItem({
      title: 'High movie, older',
      category: 'movies',
      status: 'backlog',
      priority: 'high',
      dateAdded: '2026-01-15T00:00:00.000Z',
    })

    const sections = getDashboardSections([gameLow, bookHighNewer, movieHighOlder])

    expect(sections.startNext.map((i) => i.title)).toEqual([
      'High movie, older',
      'High book, newer',
      'Low priority game',
    ])
  })

  it('keeps only the best candidate from a category that dominates the backlog', () => {
    const runnerUp = buildItem({
      title: 'Second game',
      category: 'games',
      status: 'backlog',
      priority: 'high',
      dateAdded: '2026-02-01T00:00:00.000Z',
    })
    const best = buildItem({
      title: 'Top game',
      category: 'games',
      status: 'backlog',
      priority: 'high',
      dateAdded: '2026-01-15T00:00:00.000Z',
    })
    const alsoRan = buildItem({
      title: 'Low game',
      category: 'games',
      status: 'backlog',
      priority: 'low',
      dateAdded: '2026-01-01T00:00:00.000Z',
    })

    const sections = getDashboardSections([runnerUp, best, alsoRan])

    expect(sections.startNext.map((i) => i.title)).toEqual(['Top game'])
  })

  it('surfaces every category with a backlog item, even past the section limit', () => {
    const categories = ['games', 'books', 'movies', 'anime', 'manga', 'music'] as const
    const items = categories.map((category) =>
      buildItem({ title: `Next ${category}`, category, status: 'backlog' }),
    )

    const sections = getDashboardSections(items, 3)

    expect(sections.startNext).toHaveLength(categories.length)
  })

  it('excludes wishlist items from startNext', () => {
    const wishlist = buildItem({ status: 'wishlist' })

    const sections = getDashboardSections([wishlist])

    expect(sections.startNext).toHaveLength(0)
  })

  it('puts completed items in recentlyFinished, most recently completed first', () => {
    const older = buildItem({
      title: 'Finished earlier',
      status: 'completed',
      dateCompleted: '2026-02-01T00:00:00.000Z',
    })
    const newer = buildItem({
      title: 'Finished later',
      status: 'completed',
      dateCompleted: '2026-02-20T00:00:00.000Z',
    })

    const sections = getDashboardSections([older, newer])

    expect(sections.recentlyFinished.map((i) => i.title)).toEqual([
      'Finished later',
      'Finished earlier',
    ])
  })

  it('lists recentlyAdded across all statuses, newest first', () => {
    const older = buildItem({ title: 'Old', dateAdded: '2026-01-01T00:00:00.000Z' })
    const newer = buildItem({ title: 'New', dateAdded: '2026-02-01T00:00:00.000Z' })

    const sections = getDashboardSections([older, newer])

    expect(sections.recentlyAdded.map((i) => i.title)).toEqual(['New', 'Old'])
  })

  it('caps every section at the given limit', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      buildItem({ title: `Item ${i.toString()}`, status: 'currently-using' }),
    )

    const sections = getDashboardSections(items, 3)

    expect(sections.continue).toHaveLength(3)
  })

  it('returns empty sections for an empty backlog', () => {
    const sections = getDashboardSections([])

    expect(sections).toEqual({
      continue: [],
      startNext: [],
      recentlyFinished: [],
      recentlyAdded: [],
    })
  })
})
