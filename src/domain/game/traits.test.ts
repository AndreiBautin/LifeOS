import { describe, expect, it } from 'vitest'

import { ALL_ACTS, LIFE_AREAS } from './registry'
import { areasWithoutTrait, traitForArea, traitStandings, TRAITS } from './traits'
import { xpFrom } from './xp'

/**
 * The partition is the whole design, so it is the whole test file.
 *
 * A trait is a projection of XP and nothing else. What makes that claim
 * true rather than aspirational is that the traits cover every area and
 * cover no area twice — which is what keeps the bars summing to exactly
 * the XP total, and keeps rule three ("nothing counted twice") holding
 * by construction.
 */
describe('the trait partition', () => {
  /*
   * The silent failure. An area missing from the partition pays XP that
   * appears in the character total and in no trait, so the bars quietly
   * add up to less than the level above them and nothing errors. Exactly
   * the shape of a muscle group belonging to no tier, which typechecked
   * cleanly.
   */
  it('gives every life area a trait', () => {
    expect(areasWithoutTrait()).toEqual([])
  })

  it('gives no area two traits', () => {
    for (const area of LIFE_AREAS) {
      expect(TRAITS.filter((trait) => trait.areas.includes(area))).toHaveLength(1)
    }
  })

  it('claims no area that does not exist', () => {
    // A typo'd area would silently claim nothing and read as a trait
    // that never moves.
    for (const trait of TRAITS) {
      for (const area of trait.areas) {
        expect(LIFE_AREAS).toContain(area)
      }
    }
  })

  it('has a distinct id and label for each', () => {
    expect(new Set(TRAITS.map((one) => one.id)).size).toBe(TRAITS.length)
    expect(new Set(TRAITS.map((one) => one.label)).size).toBe(TRAITS.length)
  })

  /*
   * Every trait says what fed it. A bar labelled "Charisma" with no
   * source is the invented scale this design exists to avoid.
   */
  it('says what feeds each one', () => {
    for (const trait of TRAITS) {
      expect(trait.blurb.trim()).not.toBe('')
    }
  })
})

describe('levelling a trait', () => {
  /*
   * The load-bearing arithmetic. If the trait totals ever stopped
   * summing to the XP total, either an area is counted twice or one is
   * counted not at all — and both look like a slightly wrong bar rather
   * than like a bug.
   */
  it('splits the XP total exactly, with nothing lost or doubled', () => {
    const tally = Object.fromEntries(ALL_ACTS.map((act, index) => [act.id, index + 1]))

    const total = xpFrom(tally, ALL_ACTS)
    const across = traitStandings(tally, ALL_ACTS).reduce((sum, one) => sum + one.xp, 0)

    expect(across).toBe(total)
    expect(total).toBeGreaterThan(0)
  })

  it('counts an act under the trait its area belongs to', () => {
    const standings = traitStandings({ 'training.session-finished': 2 }, ALL_ACTS)

    const strength = standings.find((one) => one.trait.id === 'strength')
    expect(strength?.xp).toBe(100)
    // And nowhere else.
    expect(standings.filter((one) => one.xp > 0)).toHaveLength(1)
  })

  it('gathers a bundled trait from every area that feeds it', () => {
    // Craft is quests, the house and the tree — three areas, one bar.
    const standings = traitStandings(
      { 'projects.main-action-closed': 1, 'base.chore-kept': 1 },
      ALL_ACTS,
    )

    expect(standings.find((one) => one.trait.id === 'craft')?.xp).toBe(55)
  })

  /*
   * Absent, never zero. A trait nothing has paid into is unproven rather
   * than a zero, so the screen can say so instead of drawing a bar at
   * nought against a scale that reads as failing.
   */
  it('reports an untouched trait as unproven rather than as a zero', () => {
    const standings = traitStandings({}, ALL_ACTS)

    expect(standings.every((one) => !one.proven)).toBe(true)
    expect(standings.every((one) => one.xp === 0)).toBe(true)
  })

  it('shares the character level curve rather than inventing one', () => {
    // Level 2 costs 100. A trait at exactly that is level 2, the same as
    // a character would be — the point of not having a second curve.
    const standings = traitStandings({ 'training.session-finished': 2 }, ALL_ACTS)

    expect(standings.find((one) => one.trait.id === 'strength')?.level).toBe(2)
  })

  it('returns a standing for every trait, fed or not', () => {
    expect(traitStandings({}, ALL_ACTS)).toHaveLength(TRAITS.length)
  })
})

describe('finding an area’s trait', () => {
  it('answers for every declared area', () => {
    for (const area of LIFE_AREAS) {
      expect(traitForArea(area)).toBeDefined()
    }
  })

  /*
   * Finance pays into Fortune and will never move it, because it
   * declares no acts on purpose — a net worth is measured, not done.
   * Belonging to the partition anyway is what stops it reading as an
   * area somebody forgot.
   */
  it('gives finance a trait even though it pays no XP', () => {
    expect(traitForArea('finance')?.id).toBe('fortune')
  })
})
