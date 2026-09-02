import { describe, expect, it } from 'vitest'

import { seasonOf } from '@/domain/game/season'

import {
  challengesFor,
  passFor,
  shippedIdFor,
  SHIPPED_CHALLENGES,
  type ChallengeMark,
  type ShippedChallenge,
} from './challenge'

const autumn = seasonOf(new Date('2026-10-15T12:00:00'))
const winter = seasonOf(new Date('2026-01-15T12:00:00'))

const shipped = (slug: string, from: string, to: string): ShippedChallenge => ({
  slug,
  event: 'Test',
  title: slug,
  blurb: '',
  from,
  to,
})

describe('challengesFor', () => {
  it('places a shipped challenge in the year the season supplies', () => {
    const [one] = challengesFor(autumn, [], [shipped('pumpkin', '10-20', '10-31')])

    expect(one?.id).toBe('pumpkin:2026')
    expect(one?.from).toBe('2026-10-20')
    expect(one?.to).toBe('2026-10-31')
  })

  it('leaves out a challenge whose window is in another season', () => {
    expect(challengesFor(autumn, [], [shipped('swim', '07-01', '07-31')])).toHaveLength(0)
  })

  /*
   * Winter is the case a calendar year gets wrong: it is named for the
   * year it *ends* in, so Winter 2026 contains December 2025. Placing by
   * the season's own months is what makes that fall out rather than
   * needing a branch.
   */
  it('puts a December challenge in the December that winter actually contains', () => {
    const [one] = challengesFor(winter, [], [shipped('give', '12-01', '12-24')])

    expect(one?.id).toBe('give:2025')
    expect(one?.from).toBe('2025-12-01')
  })

  /* A window closing in an earlier month has run into the next year. */
  it('carries a window across the new year', () => {
    const [one] = challengesFor(winter, [], [shipped('review', '12-27', '01-07')])

    expect(one?.from).toBe('2025-12-27')
    expect(one?.to).toBe('2026-01-07')
  })

  it('applies a completion recorded against that year', () => {
    const marks: ChallengeMark[] = [{ id: 'pumpkin:2026', completedAt: '2026-10-25' }]
    const [one] = challengesFor(autumn, marks, [shipped('pumpkin', '10-20', '10-31')])

    expect(one?.completedAt).toBe('2026-10-25')
  })

  /*
   * The reason a shipped instance is addressed `<slug>:<year>` rather
   * than by slug alone. Carving a pumpkin in 2026 must say nothing about
   * 2027, or every shipped challenge would be permanently done after its
   * first year.
   */
  it('does not carry a completion from one year into the next', () => {
    const marks: ChallengeMark[] = [{ id: 'pumpkin:2026', completedAt: '2026-10-25' }]
    const next = seasonOf(new Date('2027-10-15T12:00:00'))
    const [one] = challengesFor(next, marks, [shipped('pumpkin', '10-20', '10-31')])

    expect(one?.id).toBe('pumpkin:2027')
    expect(one?.completedAt).toBeUndefined()
  })

  /*
   * A shipped challenge is hidden rather than deleted, because the
   * catalogue ships in the bundle and a deletion would be undone by the
   * next release.
   */
  it('drops a shipped challenge the person hid', () => {
    const marks: ChallengeMark[] = [{ id: 'pumpkin:2026', hiddenAt: '2026-10-01' }]

    expect(challengesFor(autumn, marks, [shipped('pumpkin', '10-20', '10-31')])).toHaveLength(0)
  })

  it('includes a challenge written for this season and not one written for another', () => {
    const marks: ChallengeMark[] = [
      { id: 'a', own: { title: 'Mine', seasonId: '2026-autumn' } },
      { id: 'b', own: { title: 'Other', seasonId: '2026-winter' } },
    ]
    const all = challengesFor(autumn, marks, [])

    expect(all.map((one) => one.title)).toEqual(['Mine'])
    expect(all[0]?.own).toBe(true)
  })

  it('drops an own challenge that was removed', () => {
    const marks: ChallengeMark[] = [
      { id: 'a', own: { title: 'Mine', seasonId: '2026-autumn' }, hiddenAt: '2026-10-01' },
    ]

    expect(challengesFor(autumn, marks, [])).toHaveLength(0)
  })

  /*
   * Order is catalogue order then the order they were written. Sorting
   * by completion would move a row under the thumb that just ticked it.
   */
  it('does not reorder when something is completed', () => {
    const catalogue = [shipped('a', '10-01', '10-31'), shipped('b', '10-01', '10-31')]
    const marks: ChallengeMark[] = [{ id: 'b:2026', completedAt: '2026-10-02' }]

    expect(challengesFor(autumn, marks, catalogue).map((one) => one.id)).toEqual([
      'a:2026',
      'b:2026',
    ])
  })
})

describe('passFor', () => {
  it('counts what is done against what exists, so the denominator is real', () => {
    const catalogue = [shipped('a', '10-01', '10-31'), shipped('b', '10-01', '10-31')]
    const pass = passFor(challengesFor(autumn, [{ id: 'a:2026', completedAt: 'x' }], catalogue))

    expect(pass.done).toBe(1)
    expect(pass.total).toBe(2)
  })

  it('is nought of nought when a season has none', () => {
    const pass = passFor([])

    expect(pass.done).toBe(0)
    expect(pass.total).toBe(0)
  })
})

describe('the shipped catalogue', () => {
  it('has no repeated slug, since a slug is half of a stored id', () => {
    const slugs = SHIPPED_CHALLENGES.map((one) => one.slug)

    expect(new Set(slugs).size).toBe(slugs.length)
  })

  /*
   * A challenge whose window opens in a month no season claims would be
   * shipped and drawn nowhere — the silent loss this whole placement
   * scheme exists to avoid.
   */
  it('places every shipped challenge in some season', () => {
    const seasons = [
      seasonOf(new Date('2026-01-15T12:00:00')),
      seasonOf(new Date('2026-04-15T12:00:00')),
      seasonOf(new Date('2026-07-15T12:00:00')),
      seasonOf(new Date('2026-10-15T12:00:00')),
    ]
    const placed = new Set(
      seasons.flatMap((season) =>
        challengesFor(season, []).map((one) => one.id.slice(0, one.id.lastIndexOf(':'))),
      ),
    )

    for (const one of SHIPPED_CHALLENGES) expect(placed).toContain(one.slug)
  })

  it('builds an id a completion can be recorded against', () => {
    expect(shippedIdFor('pumpkin', 2026)).toBe('pumpkin:2026')
  })
})
