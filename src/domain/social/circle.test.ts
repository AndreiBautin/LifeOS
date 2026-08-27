import { describe, expect, it } from 'vitest'

import { asFriendId } from '@/domain/ids/ids'

import {
  byMostOverdue,
  DEFAULT_CIRCLE_BANDS,
  daysSince,
  isActive,
  isOverdue,
  logHangout,
  maintenanceScore,
  rateCircle,
  type Friend,
} from './circle'

const TODAY = '2026-08-26'

function aFriend(name: string, lastHangout: string): Friend {
  return {
    id: asFriendId(name),
    name,
    lastHangout,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('the active circle', () => {
  it('counts somebody seen inside the window', () => {
    expect(isActive(aFriend('Sam', '2026-02-01'), 12, TODAY)).toBe(true)
  })

  it('drops somebody last seen beyond it', () => {
    expect(isActive(aFriend('Alex', '2024-01-01'), 12, TODAY)).toBe(false)
  })

  /*
   * Going quiet changes what this answers and nothing else. The record and
   * its history stay, and somebody becomes active again the moment a
   * recent date is logged — which is what makes the active circle a
   * reading rather than a list somebody has to curate.
   */
  it('brings somebody back the moment a recent date is logged', () => {
    const lapsed = aFriend('Alex', '2024-01-01')

    expect(isActive(logHangout(lapsed, '2026-08-01'), 12, TODAY)).toBe(true)
  })
})

describe('logHangout', () => {
  /*
   * Forward only. "Last hangout" should be the most recent meeting known,
   * not the most recently typed — otherwise correcting a forgotten coffee
   * in March makes it look like you have not seen somebody since.
   */
  it('ignores a date older than the one on file', () => {
    const friend = aFriend('Sam', '2026-08-01')

    expect(logHangout(friend, '2026-03-01')).toBe(friend)
  })

  it('advances on a newer one', () => {
    expect(logHangout(aFriend('Sam', '2026-08-01'), '2026-08-20').lastHangout).toBe('2026-08-20')
  })
})

describe('overdue', () => {
  it('flags somebody past the threshold', () => {
    expect(isOverdue(aFriend('Sam', '2026-01-01'), 3, TODAY)).toBe(true)
    expect(isOverdue(aFriend('Sam', '2026-07-01'), 3, TODAY)).toBe(false)
  })

  it('counts the days since, across a month boundary', () => {
    expect(daysSince('2026-07-27', TODAY)).toBe(30)
  })
})

describe('rateCircle', () => {
  it('bands the count', () => {
    expect(rateCircle(3, DEFAULT_CIRCLE_BANDS)).toBe('thin')
    expect(rateCircle(7, DEFAULT_CIRCLE_BANDS)).toBe('healthy')
    expect(rateCircle(12, DEFAULT_CIRCLE_BANDS)).toBe('robust')
    expect(rateCircle(20, DEFAULT_CIRCLE_BANDS)).toBe('expansive')
  })
})

describe('maintenanceScore', () => {
  /*
   * Orthogonal to size, and both readings are needed: a small circle
   * perfectly kept up scores 100 here, and a large neglected one scores
   * low, whatever their size ratings say.
   */
  it('is the share of the active circle not overdue', () => {
    const friends = [
      aFriend('kept up', '2026-08-01'),
      aFriend('kept up too', '2026-07-01'),
      aFriend('neglected', '2026-01-01'),
      aFriend('gone quiet entirely', '2023-01-01'),
    ]

    // The fourth is outside the active circle, so it is not counted at
    // all — being inactive is not the same as being neglected.
    expect(maintenanceScore(friends, 12, 3, TODAY)).toBe(67)
  })

  it('is a hundred for a small circle perfectly kept up', () => {
    expect(maintenanceScore([aFriend('Sam', '2026-08-01')], 12, 3, TODAY)).toBe(100)
  })

  /*
   * Nothing, never zero. Nobody to have neglected is not the same as
   * having neglected everybody, and a zero drags an average down for a
   * fact that is not true.
   */
  it('has nothing to say with no active circle at all', () => {
    expect(maintenanceScore([], 12, 3, TODAY)).toBeUndefined()
    expect(maintenanceScore([aFriend('lapsed', '2020-01-01')], 12, 3, TODAY)).toBeUndefined()
  })
})

describe('byMostOverdue', () => {
  /*
   * The ordering is the point of the screen. Alphabetised tells you who
   * you know; ordered by neglect tells you who to call.
   */
  it('puts the longest unseen first', () => {
    const friends = [
      aFriend('recent', '2026-08-01'),
      aFriend('ancient', '2024-01-01'),
      aFriend('middling', '2026-02-01'),
    ]

    expect(byMostOverdue(friends).map((one) => one.name)).toEqual(['ancient', 'middling', 'recent'])
  })

  it('does not reorder the array it was handed', () => {
    const friends = [aFriend('recent', '2026-08-01'), aFriend('ancient', '2024-01-01')]

    byMostOverdue(friends)

    expect(friends.map((one) => one.name)).toEqual(['recent', 'ancient'])
  })
})
