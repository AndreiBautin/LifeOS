import { describe, expect, it } from 'vitest'

import { tiersMatch } from '@/domain/priority/divergence'
import type { MuscleTiers } from '@/domain/priority/tiers'

const shipped: MuscleTiers = [
  { rank: 1, members: ['biceps', 'triceps'], label: 'Specialising' },
  { rank: 2, members: ['chest'], label: 'Building' },
  { rank: 3, members: ['calves'], label: 'Maintaining' },
]

describe('spotting a diverged tier list', () => {
  it('matches an identical list', () => {
    expect(tiersMatch(shipped, shipped)).toBe(true)
  })

  /*
   * Order is presentation. A lifter who dragged two muscles into a tier
   * in a different sequence has not diverged from anything, and telling
   * them they have would train them to ignore the message.
   */
  it('ignores the order of members inside a tier', () => {
    const reordered: MuscleTiers = [
      { rank: 1, members: ['triceps', 'biceps'], label: 'Specialising' },
      { rank: 2, members: ['chest'], label: 'Building' },
      { rank: 3, members: ['calves'], label: 'Maintaining' },
    ]

    expect(tiersMatch(shipped, reordered)).toBe(true)
  })

  it('ignores the order of the tiers themselves', () => {
    const flipped: MuscleTiers = [
      { rank: 3, members: ['calves'], label: 'Maintaining' },
      { rank: 1, members: ['biceps', 'triceps'], label: 'Specialising' },
      { rank: 2, members: ['chest'], label: 'Building' },
    ]

    expect(tiersMatch(shipped, flipped)).toBe(true)
  })

  it('ignores an empty tier', () => {
    const padded: MuscleTiers = [...shipped, { rank: 4, members: [], label: 'Unused' }]
    expect(tiersMatch(shipped, padded)).toBe(true)
  })

  /*
   * The case this exists for: a lift moved between tiers, which is
   * exactly what happened when the squat and deadlift dropped to
   * maintenance in the shipped defaults and a saved list kept them a
   * tier up.
   */
  it('spots a member that moved tier', () => {
    const moved: MuscleTiers = [
      { rank: 1, members: ['biceps'], label: 'Specialising' },
      { rank: 2, members: ['chest', 'triceps'], label: 'Building' },
      { rank: 3, members: ['calves'], label: 'Maintaining' },
    ]

    expect(tiersMatch(shipped, moved)).toBe(false)
  })

  it('spots a member that is missing entirely', () => {
    const dropped: MuscleTiers = [
      { rank: 1, members: ['biceps'], label: 'Specialising' },
      { rank: 2, members: ['chest'], label: 'Building' },
      { rank: 3, members: ['calves'], label: 'Maintaining' },
    ]

    expect(tiersMatch(shipped, dropped)).toBe(false)
  })
})
