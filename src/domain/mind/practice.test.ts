import { describe, expect, it } from 'vitest'

import { asAttemptId } from '@/domain/ids/ids'

import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  daysPractisedIn,
  inLogOrder,
  solvedIn,
  timesSolved,
  tracksIn,
  type Attempt,
} from './practice'

function attempt(title: string, solvedOn: string, extra: Partial<Attempt> = {}): Attempt {
  return {
    id: asAttemptId(`${title}-${solvedOn}`),
    title,
    solvedOn,
    createdAt: `${solvedOn}T09:00:00`,
    ...extra,
  }
}

describe('counting a month of practice', () => {
  const month = [
    attempt('Two Sum', '2026-08-03'),
    attempt('Valid Parentheses', '2026-08-03'),
    attempt('Reverse List', '2026-08-11'),
    attempt('Last month', '2026-07-30'),
  ]

  it('counts the problems solved in it', () => {
    expect(solvedIn(month, '2026-08')).toBe(3)
  })

  /*
   * The pair is the point. Six problems in one Sunday and six spread
   * over six days are very different months, and neither number alone
   * can say which happened.
   */
  it('counts the days practised, which is a different question', () => {
    expect(daysPractisedIn(month, '2026-08')).toBe(2)
  })

  it('says nothing about a month with no practice', () => {
    expect(solvedIn(month, '2026-09')).toBe(0)
    expect(daysPractisedIn(month, '2026-09')).toBe(0)
  })

  /*
   * Compared as a prefix of the day key, because both are local strings.
   * Building a `Date` here would reintroduce the timezone bug this app
   * has shipped five times.
   */
  it('matches on the month prefix rather than parsing a date', () => {
    expect(solvedIn([attempt('x', '2026-12-31')], '2026-12')).toBe(1)
    expect(solvedIn([attempt('x', '2026-12-31')], '2027-01')).toBe(0)
  })
})

describe('reading the log', () => {
  it('puts the most recent first', () => {
    const ordered = inLogOrder([
      attempt('Older', '2026-08-01'),
      attempt('Newest', '2026-08-20'),
      attempt('Middle', '2026-08-10'),
    ])

    expect(ordered.map((one) => one.title)).toEqual(['Newest', 'Middle', 'Older'])
  })

  /*
   * Two problems on one day are two events with an order, and the later
   * one goes first. Left to the sort's stability this would depend on
   * whatever order the store happened to return.
   */
  it('breaks a tie on the same day by when it was logged', () => {
    const ordered = inLogOrder([
      { ...attempt('First', '2026-08-03'), createdAt: '2026-08-03T09:00:00' },
      { ...attempt('Second', '2026-08-03'), createdAt: '2026-08-03T14:00:00' },
    ])

    expect(ordered.map((one) => one.title)).toEqual(['Second', 'First'])
  })

  it('says nothing about an empty log', () => {
    expect(inLogOrder([])).toEqual([])
  })
})

describe('offering back what has been practised', () => {
  it('lists each track once, alphabetically', () => {
    const tracks = tracksIn([
      attempt('a', '2026-08-01', { track: 'typescript' }),
      attempt('b', '2026-08-02', { track: 'rust' }),
      attempt('c', '2026-08-03', { track: 'typescript' }),
      attempt('d', '2026-08-04'),
    ])

    expect(tracks).toEqual(['rust', 'typescript'])
  })

  it('ignores a blank track rather than offering an empty chip', () => {
    expect(tracksIn([attempt('a', '2026-08-01', { track: '   ' })])).toEqual([])
  })
})

describe('having solved something before', () => {
  const log = [
    attempt('Two Sum', '2026-03-01', { track: 'typescript' }),
    attempt('Two Sum', '2026-08-01', { track: 'typescript' }),
    attempt('Two Sum', '2026-08-02', { track: 'rust' }),
  ]

  /*
   * Reported, never refused. A kata done a second time from memory is
   * the point of a kata, so this exists to let a screen say "you did
   * this in March" rather than to stop anybody logging it.
   */
  it('counts previous times, matched on title and track', () => {
    expect(timesSolved(log, 'Two Sum', 'typescript')).toBe(2)
    expect(timesSolved(log, 'Two Sum', 'rust')).toBe(1)
  })

  it('treats the same problem in another language as a different one', () => {
    expect(timesSolved(log, 'Two Sum', 'go')).toBe(0)
  })

  it('is case- and space-insensitive, so nobody has to be careful', () => {
    expect(timesSolved(log, '  two sum ', 'TypeScript')).toBe(2)
  })

  it('matches an untracked problem against untracked ones', () => {
    const untracked = [attempt('Puzzle', '2026-08-01')]

    expect(timesSolved(untracked, 'Puzzle', undefined)).toBe(1)
    expect(timesSolved(untracked, 'Puzzle', 'rust')).toBe(0)
  })
})

describe('difficulty', () => {
  it('has a label for each', () => {
    for (const one of DIFFICULTIES) {
      expect(DIFFICULTY_LABELS[one].trim()).not.toBe('')
    }
  })
})
