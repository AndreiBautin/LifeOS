import { describe, expect, it } from 'vitest'

import { LEVELS } from './character'
import { RATING_CADENCES, RATING_DIRECTIONS } from './rating'
import { actById, ALL_ACTS, ALL_LADDERS, ALL_RATINGS, LIFE_AREAS, SCORING } from './registry'

/*
 * The three rules of docs/GAME_MODEL.md, checked against the table rather
 * than described in a comment. Each of these fails on a change that is
 * individually reasonable and collectively turns the model into a scoring
 * system nobody trusts.
 */

describe('the registry covers the plan', () => {
  it('has an entry for every life area, once', () => {
    expect(SCORING.map((area) => area.area).sort()).toEqual([...LIFE_AREAS].sort())
  })

  it('gives every area a phase of the absorption sequence', () => {
    for (const area of SCORING) {
      expect(area.phase, area.area).toBeGreaterThanOrEqual(0)
    }
  })

  it('has exactly one tree', () => {
    expect(SCORING.filter((area) => area.hasTree).map((area) => area.area)).toEqual(['upgrades'])
  })
})

describe('rule one — no ladder is fed by XP', () => {
  /*
   * A ladder must be anchored to something outside the app. This is the
   * enforceable half of the rule: XP cannot move a scale whose rungs are
   * a published standard, because the standard does not know XP exists.
   */
  it('anchors every ladder to a named external standard', () => {
    for (const ladder of ALL_LADDERS) {
      expect(ladder.anchor.trim().length, ladder.id).toBeGreaterThan(0)
    }
  })

  it('gives every ladder one ascending threshold per level', () => {
    for (const ladder of ALL_LADDERS) {
      expect(ladder.thresholds.length, ladder.id).toBe(LEVELS.length)

      const ascending = [...ladder.thresholds].every(
        (value, index) => index === 0 || value > (ladder.thresholds[index - 1] ?? 0),
      )
      expect(ascending, ladder.id).toBe(true)
    }
  })
})

describe('rule two — no rating is promoted to a ladder', () => {
  it('uses only the five directions and the three cadences', () => {
    for (const rating of ALL_RATINGS) {
      expect(RATING_DIRECTIONS, rating.id).toContain(rating.direction)
      expect(RATING_CADENCES, rating.id).toContain(rating.cadence)
    }
  })

  it('gives a threshold to exactly the directions that need one', () => {
    for (const rating of ALL_RATINGS) {
      const needsThreshold = rating.direction === 'stay-above' || rating.direction === 'stay-below'
      expect(rating.threshold !== undefined, rating.id).toBe(needsThreshold)

      const needsRange = rating.direction === 'stay-within-range'
      expect(rating.range !== undefined, rating.id).toBe(needsRange)
    }
  })

  /*
   * The rule's teeth. Promotion happens by a rating and a ladder both
   * claiming the same measurement — at which point the same number has a
   * level *and* a direction, and the distinction phase 0 drew stops
   * existing without anything failing.
   */
  it('never scores one measurement as both a ladder and a rating', () => {
    const ladderSources = new Set(ALL_LADDERS.map((ladder) => ladder.source))

    for (const rating of ALL_RATINGS) {
      expect(ladderSources.has(rating.source), rating.source).toBe(false)
    }
  })
})

describe('rule three — nothing is counted twice', () => {
  it('gives every act, ladder and rating its own id', () => {
    const ids = [
      ...ALL_ACTS.map((act) => act.id),
      ...ALL_LADDERS.map((ladder) => ladder.id),
      ...ALL_RATINGS.map((rating) => rating.id),
    ]

    expect(new Set(ids).size).toBe(ids.length)
  })

  /*
   * An act and a measurement are two different kinds of event, and
   * `creditFor` routes on the id. A source that is also an act id would
   * make one event ambiguous — and the ambiguity resolves silently, into
   * whichever branch is checked first.
   */
  it('keeps act ids and measurement sources disjoint', () => {
    const actIds = new Set(ALL_ACTS.map((act) => act.id))
    const sources = [
      ...ALL_LADDERS.map((ladder) => ladder.source),
      ...ALL_RATINGS.map((rating) => rating.source),
    ]

    for (const source of sources) {
      expect(actIds.has(source), source).toBe(false)
    }
  })

  it('names every act and source under the area that owns it', () => {
    for (const area of SCORING) {
      for (const act of area.acts) {
        expect(act.id.startsWith(`${area.area}.`), act.id).toBe(true)
        expect(act.area, act.id).toBe(area.area)
      }
      for (const ladder of area.ladders) {
        expect(ladder.source.startsWith(`${area.area}.`), ladder.source).toBe(true)
      }
      for (const rating of area.ratings) {
        expect(rating.source.startsWith(`${area.area}.`), rating.source).toBe(true)
      }
    }
  })
})

describe('looking an act up to acknowledge it', () => {
  /*
   * The acknowledgement on screen reads its number from here, so this is
   * the coupling that keeps it from disagreeing with `tallyActs`. A
   * component with its own copy of "a session is 50" would drift
   * silently: the sheet would say one thing and the badge another, both
   * looking authoritative.
   */
  it('returns the registry’s own label and points', () => {
    const sent = actById('jobs.application-sent')

    expect(sent?.points).toBeGreaterThan(0)
    expect(sent?.label).toBeDefined()
  })

  it('says nothing about an act it does not know', () => {
    // Silence rather than a guessed value: an unknown id must not become
    // a plausible-looking number on screen.
    expect(actById('nonsense.invented')).toBeUndefined()
  })

  it('can find every act the registry declares', () => {
    for (const act of ALL_ACTS) expect(actById(act.id)).toBe(act)
  })
})
