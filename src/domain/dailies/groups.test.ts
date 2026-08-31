import { describe, expect, it } from 'vitest'

import { asDailyId } from '@/domain/ids/ids'

import type { Daily, PartOfDay } from './daily'
import { byGroup, groupNamesIn, normaliseGroup, sameGroup } from './groups'

function daily(title: string, group?: string, partOfDay?: PartOfDay): Daily {
  return {
    id: asDailyId(title),
    title,
    cadence: { kind: 'every-day' },
    done: [],
    createdAt: '2026-08-01T09:00:00',
    ...(group === undefined ? {} : { group }),
    ...(partOfDay === undefined ? {} : { partOfDay }),
  }
}

describe('a group name', () => {
  it('is absent rather than empty', () => {
    // A stored '' is a state every future reader has to have explained.
    expect(normaliseGroup('   ')).toBeUndefined()
    expect(normaliseGroup(undefined)).toBeUndefined()
  })

  it('is trimmed', () => {
    expect(normaliseGroup('  Pet care ')).toBe('Pet care')
  })

  it('matches case-insensitively, so nobody has to notice', () => {
    expect(sameGroup('Pet care', 'pet care')).toBe(true)
    expect(sameGroup('Pet care', 'Supplements')).toBe(false)
  })

  it('treats two ungrouped habits as one group', () => {
    expect(sameGroup(undefined, undefined)).toBe(true)
    expect(sameGroup(undefined, 'Supplements')).toBe(false)
  })
})

describe('grouping habits', () => {
  it('collects habits under one name however it was typed', () => {
    const groups = byGroup([
      daily('Creatine', 'Supplements'),
      daily('Vitamin D', 'supplements'),
      daily('Feed the dog', 'Pet care'),
    ])

    expect(groups).toHaveLength(2)
    // Found by name, not by position: with no part of day these tie on
    // rank and fall back to the alphabet, so Pet care leads.
    expect(groups.find((one) => one.name === 'Supplements')?.dailies).toHaveLength(2)
  })

  it('falls back to the alphabet when two groups run at the same time', () => {
    const groups = byGroup([daily('Creatine', 'Supplements'), daily('Feed the dog', 'Pet care')])

    expect(groups.map((one) => one.name)).toEqual(['Pet care', 'Supplements'])
  })

  /*
   * The load-bearing ordering choice. Sorting the group names would put
   * Teeth after Supplements on a screen whose job is to read as a
   * routine — and the rows themselves are already chronological, so an
   * alphabetical pass over the groups would have two orderings
   * disagreeing inside one list.
   */
  it('orders groups by their earliest habit, not alphabetically', () => {
    const groups = byGroup([
      daily('Floss', 'Teeth', 'evening'),
      daily('Creatine', 'Supplements', 'morning'),
    ])

    expect(groups.map((one) => one.name)).toEqual(['Supplements', 'Teeth'])
  })

  it('puts a group where its earliest habit is, not its last', () => {
    const groups = byGroup([
      daily('Walk the dog', 'Pet care', 'evening'),
      daily('Feed the dog', 'Pet care', 'morning'),
      daily('Brush', 'Teeth', 'afternoon'),
    ])

    expect(groups.map((one) => one.name)).toEqual(['Pet care', 'Teeth'])
  })

  /*
   * Last, for the reason a habit with no part of day sorts last: these
   * belong to no category rather than to the first one. The caller
   * renders it without a heading, because a heading over the leftovers
   * is a category nobody chose.
   */
  it('puts the ungrouped habits last, however early they run', () => {
    const groups = byGroup([
      daily('Make the bed', undefined, 'morning'),
      daily('Floss', 'Teeth', 'evening'),
    ])

    expect(groups.map((one) => one.name)).toEqual(['Teeth', undefined])
  })

  it('keeps the order it was given inside a group', () => {
    // Whatever sort the caller applied — chronological, on every screen
    // that shows these — has to survive the grouping.
    const groups = byGroup([
      daily('First', 'Admin'),
      daily('Second', 'Admin'),
      daily('Third', 'Admin'),
    ])

    expect(groups[0]?.dailies.map((one) => one.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('says nothing about an empty list', () => {
    expect(byGroup([])).toEqual([])
  })

  it('makes one unnamed group when nothing is grouped', () => {
    const groups = byGroup([daily('One'), daily('Two')])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBeUndefined()
  })
})

describe('offering names already in use', () => {
  it('lists each once, whatever the casing', () => {
    expect(
      groupNamesIn([
        daily('Creatine', 'Supplements'),
        daily('Vitamin D', 'supplements'),
        daily('Feed the dog', 'Pet care'),
      ]),
    ).toEqual(['Pet care', 'Supplements'])
  })

  it('ignores the ungrouped', () => {
    expect(groupNamesIn([daily('One'), daily('Two', 'Admin')])).toEqual(['Admin'])
  })
})
