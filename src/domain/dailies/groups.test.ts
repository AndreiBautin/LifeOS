import { describe, expect, it } from 'vitest'

import { asDailyId } from '@/domain/ids/ids'
import { BASE, TRAINING } from '@/domain/base/base'

import type { Daily, PartOfDay } from './daily'
import {
  byGroup,
  byPartOfDay,
  groupNamesIn,
  groupOnly,
  homeOrGroup,
  normaliseGroup,
  sameGroup,
} from './groups'

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

function chore(title: string, partOfDay?: PartOfDay): Daily {
  return { ...daily(title, undefined, partOfDay), belongsTo: BASE }
}

/** The rule for a screen showing one home — Base, Train, Mind. */
const byGroupOnly = (dailies: readonly Daily[]) => byGroup(dailies, groupOnly)

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
    const groups = byGroupOnly([
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
    const groups = byGroupOnly([
      daily('Creatine', 'Supplements'),
      daily('Feed the dog', 'Pet care'),
    ])

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
    const groups = byGroupOnly([
      daily('Floss', 'Teeth', 'evening'),
      daily('Creatine', 'Supplements', 'morning'),
    ])

    expect(groups.map((one) => one.name)).toEqual(['Supplements', 'Teeth'])
  })

  it('puts a group where its earliest habit is, not its last', () => {
    const groups = byGroupOnly([
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
    const groups = byGroupOnly([
      daily('Make the bed', undefined, 'morning'),
      daily('Floss', 'Teeth', 'evening'),
    ])

    expect(groups.map((one) => one.name)).toEqual(['Teeth', undefined])
  })

  it('keeps the order it was given inside a group', () => {
    // Whatever sort the caller applied — chronological, on every screen
    // that shows these — has to survive the grouping.
    const groups = byGroupOnly([
      daily('First', 'Admin'),
      daily('Second', 'Admin'),
      daily('Third', 'Admin'),
    ])

    expect(groups[0]?.dailies.map((one) => one.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('says nothing about an empty list', () => {
    expect(byGroupOnly([])).toEqual([])
  })

  it('makes one unnamed group when nothing is grouped', () => {
    const groups = byGroupOnly([daily('One'), daily('Two')])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBeUndefined()
  })
})

/*
 * The reported bug: *"adding a daily to the house category on the
 * homepage does not group it with the other house items from base,
 * instead creating a separate house category."* Today drew the homes in
 * one pass and the groups in another, so one name came out as two
 * sections. These are the guard on that not returning.
 */
describe('naming a category across every home', () => {
  it('puts a house chore and a habit labelled House under one name', () => {
    const groups = byGroup([chore('Bins'), daily('Hoover', 'House')], homeOrGroup)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('House')
    expect(groups[0]?.dailies.map((one) => one.title)).toEqual(['Bins', 'Hoover'])
  })

  it('reads the home before the group, so a filed chore keeps its screen name', () => {
    // A chore filed to Base and also labelled by hand is still house
    // work — the home is the decision and the group is only a label.
    const filed: Daily = { ...daily('Bins', 'Tidying'), belongsTo: BASE }

    expect(homeOrGroup(filed)).toBe('House')
    expect(homeOrGroup(daily('Hoover', 'Tidying'))).toBe('Tidying')
  })

  it('names the training home too', () => {
    const carbs: Daily = { ...daily('Pre-workout carbs'), belongsTo: TRAINING }

    expect(homeOrGroup(carbs)).toBe('Training')
  })

  it('is not what a single-home screen asks, or every chore reads as House', () => {
    // Base lists chores and nothing else; reading the home there would
    // put the whole screen under one heading repeating its own name.
    expect(groupOnly(chore('Bins'))).toBeUndefined()
  })
})

describe('banding the day', () => {
  it('runs morning, afternoon, evening, then whatever names no part', () => {
    const bands = byPartOfDay(
      [
        daily('Floss', 'Hygiene', 'evening'),
        daily('Creatine', 'Supplements'),
        daily('Walk', 'Pet care', 'morning'),
        daily('Emails', 'Admin', 'afternoon'),
      ],
      groupOnly,
    )

    expect(bands.map((one) => one.part)).toEqual(['morning', 'afternoon', 'evening', undefined])
  })

  it('draws no band for a part of the day with nothing in it', () => {
    // An empty Afternoon heading claims the afternoon asks something of
    // you, which is the opposite of what the folding above is for.
    const bands = byPartOfDay([daily('Walk', 'Pet care', 'morning')], groupOnly)

    expect(bands.map((one) => one.part)).toEqual(['morning'])
  })

  it('groups inside a band, so the categories sit under the time', () => {
    const bands = byPartOfDay(
      [
        chore('Bins', 'morning'),
        daily('Brush', 'Hygiene', 'morning'),
        daily('Floss', 'Hygiene', 'evening'),
      ],
      homeOrGroup,
    )

    expect(bands[0]?.groups.map((one) => one.name)).toEqual(['House', 'Hygiene'])
    expect(bands[1]?.groups.map((one) => one.name)).toEqual(['Hygiene'])
  })

  it('says nothing about an empty list', () => {
    expect(byPartOfDay([], homeOrGroup)).toEqual([])
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
