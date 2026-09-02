import { describe, expect, it } from 'vitest'

import { ALL_ACTS, LIFE_AREAS } from './registry'
import { areasWithoutTrait, traitForArea, traitStandings, TRAITS, UNCLAIMED_AREAS } from './traits'
import { xpFrom } from './xp'

/**
 * **The traits used to partition the areas and now select from them**,
 * so this file guards a weaker claim than it did — deliberately, and the
 * difference between the two is the whole point of what is here.
 *
 * The old rule was that every area belonged to exactly one trait, which
 * made the bars sum to the XP total exactly. Three traits were dropped
 * and six areas have no bar as a result. What must still hold: **no area
 * feeds two traits**, every claimed area exists, and the set with no
 * trait is *exactly* the set somebody decided on. That last one is what
 * keeps this a decision rather than a silence — an area added tomorrow
 * with no trait fails here until it is either claimed or listed.
 */
describe('the trait selection', () => {
  /*
   * The failure this replaces was silent: an area falling out of the
   * partition by accident paid XP into the level and into no bar, and
   * nothing said so. Naming the unclaimed areas keeps that impossible
   * while allowing the state on purpose.
   */
  it('leaves exactly the areas somebody decided to leave', () => {
    expect([...areasWithoutTrait()].sort()).toEqual([...UNCLAIMED_AREAS].sort())
  })

  it('claims every area that is not on that list', () => {
    const claimed = LIFE_AREAS.filter((area) => !UNCLAIMED_AREAS.includes(area))

    for (const area of claimed) {
      expect(traitForArea(area)).toBeDefined()
    }
  })

  it('gives no area two traits', () => {
    for (const area of LIFE_AREAS) {
      expect(TRAITS.filter((trait) => trait.areas.includes(area)).length).toBeLessThanOrEqual(1)
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

  it('feeds every trait from at least one area', () => {
    // A trait claiming nothing is a bar no act can ever move — the
    // reason Vitality was deleted rather than left unproven.
    for (const trait of TRAITS) {
      expect(trait.areas.length).toBeGreaterThan(0)
    }
  })
})

describe('levelling a trait', () => {
  /*
   * **The bars sum to the claimed areas, not to the level**, which is
   * the arithmetic that replaced "splits the XP total exactly". Counting
   * twice would still be a bug and still shows up here: the trait totals
   * must equal the XP of the areas the traits claim, no more and no
   * less. What they may not do any more is equal the total, and the
   * second assertion pins that the gap is real rather than accidental.
   */
  it('sums to the XP of the areas it claims, and falls short of the total', () => {
    const tally = Object.fromEntries(ALL_ACTS.map((act, index) => [act.id, index + 1]))

    const claimedActs = ALL_ACTS.filter((act) => traitForArea(act.area as never) !== undefined)

    const total = xpFrom(tally, ALL_ACTS)
    const claimed = xpFrom(tally, claimedActs)
    const across = traitStandings(tally, ALL_ACTS).reduce((sum, one) => sum + one.xp, 0)

    expect(across).toBe(claimed)
    expect(claimed).toBeLessThan(total)
  })

  it('counts an act under the trait its area belongs to', () => {
    const standings = traitStandings({ 'training.session-finished': 2 }, ALL_ACTS)

    const strength = standings.find((one) => one.trait.id === 'strength')
    expect(strength?.xp).toBe(100)
    // And nowhere else.
    expect(standings.filter((one) => one.xp > 0)).toHaveLength(1)
  })

  it('gathers a bundled trait from every area that feeds it', () => {
    /*
     * Intellect is the Codex and Mind — two areas, one bar. It used to
     * be Craft that showed this, over quests, the house and the tree;
     * Crafting claims a single area now, so the rule needed a trait that
     * still bundles or it would have been asserting nothing.
     */
    const standings = traitStandings(
      { 'backlog.item-finished': 1, 'mind.problem-solved': 1 },
      ALL_ACTS,
    )

    const intellect = standings.find((one) => one.trait.id === 'intellect')?.xp ?? 0
    const backlogOnly = traitStandings({ 'backlog.item-finished': 1 }, ALL_ACTS).find(
      (one) => one.trait.id === 'intellect',
    )?.xp

    expect(intellect).toBeGreaterThan(backlogOnly ?? 0)
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
  it('answers for a claimed area and is absent for an unclaimed one', () => {
    expect(traitForArea('training')?.id).toBe('strength')
    expect(traitForArea('cardio')?.id).toBe('stamina')

    /*
     * **Absent rather than a throw, and that is the shape the sheet
     * needs.** Six areas have no bar now; a lookup that failed on them
     * would make every caller branch on a state that is ordinary.
     */
    expect(traitForArea('finance')).toBeUndefined()
  })
})
