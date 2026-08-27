import { describe, expect, it } from 'vitest'

import { ALL_ACTS, SCORING } from '@/domain/game/registry'
import type { Place } from '@/domain/atlas/place/Place'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Clock, ReviewRepository } from '@/domain/repositories/ports'
import { DEFAULT_SETTINGS, type AppSettings } from '@/domain/settings/settings'

import { characterSheet, tallyActs, type SheetDeps } from './sheet'

/**
 * The character sheet is a join, not a calculation — the registry declares
 * what each area has and this turns declarations into a readout. So what
 * is worth testing is not the arithmetic but the joins: that an area with
 * nothing to say says nothing, that a ladder with no measurement does not
 * show a plausible zero, and that XP counts each act once.
 */
function harness(
  seed: {
    readonly places?: Place[]
    readonly items?: Item[]
    readonly projects?: Project[]
    readonly settings?: Partial<AppSettings>
  } = {},
) {
  const clock: Clock = { now: () => new Date(2026, 7, 26, 9, 0) }

  const list = <T>(rows: readonly T[]) => ({
    all: () => Promise.resolve(rows),
    recent: () => Promise.resolve(rows),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(rows.length),
  })

  const review: ReviewRepository = {
    metrics: () => Promise.resolve([]),
    saveMetric: () => Promise.resolve(),
    removeMetric: () => Promise.resolve(),
    restoreMetrics: () => Promise.resolve(),
    snapshots: () => Promise.resolve([]),
    snapshot: () => Promise.resolve(undefined),
    saveSnapshot: () => Promise.resolve(),
    restoreSnapshots: () => Promise.resolve(),
    removeSnapshot: () => Promise.resolve(),
    purgeSnapshot: () => Promise.resolve(),
  }

  return {
    items: list(seed.items ?? []),
    projects: list(seed.projects ?? []),
    upgrades: list([]),
    workouts: list([]),
    friends: list([]),
    places: list(seed.places ?? []),
    explored: {
      all: () => Promise.resolve(new Set()),
      reveal: () => Promise.resolve(0),
      clear: () => Promise.resolve(),
      count: () => Promise.resolve(0),
    },
    settings: {
      get: () => Promise.resolve({ ...DEFAULT_SETTINGS, ...seed.settings }),
      save: () => Promise.resolve(),
    },
    review,
    clock,
  } as unknown as SheetDeps
}

function aVisitedPlace(id: string): Place {
  return {
    id,
    name: `Place ${id}`,
    categoryId: 'food',
    status: 'visited',
    location: { coordinates: { latitude: 51.5, longitude: -0.1 } },
    favorite: false,
    tags: [],
    dateAdded: '2026-08-01T00:00:00.000Z',
  } as unknown as Place
}

describe('what an area says when it has nothing to say', () => {
  /*
   * The rule the whole sheet turns on. An area with no measurement, no
   * recorded rating and no acts is *silent* — it does not report level
   * zero, a score of nought, or "regressed". A fabricated reading is worse
   * than an obvious gap, and on a page whose entire job is to tell you how
   * things are going, a plausible zero is a lie with a progress bar.
   */
  it('reports every untouched area as silent', async () => {
    const sheet = await characterSheet(harness())

    /*
     * Training is the exception, and legitimately so: the shipped defaults
     * carry estimated maxes and a bodyweight read out of a real 5/3/1
     * export, so the strength ladders have something to read on a fresh
     * install. That is a measurement, not a fabrication.
     */
    const quiet = sheet.areas.filter((area) => area.area !== 'training')

    expect(quiet.every((area) => area.silent)).toBe(true)
    expect(sheet.areas.find((area) => area.area === 'training')?.silent).toBe(false)
  })

  it('leaves a ladder with no measurement unread rather than at zero', async () => {
    const sheet = await characterSheet(harness())
    const places = sheet.areas.find((area) => area.area === 'places')

    expect(places?.ladders[0]?.reading).toBeUndefined()
    expect(places?.ladders[0]?.value).toBeUndefined()
  })

  it('stops being silent as soon as one act has happened', async () => {
    const sheet = await characterSheet(harness({ places: [aVisitedPlace('a')] }))
    const places = sheet.areas.find((area) => area.area === 'places')

    expect(places?.silent).toBe(false)
    expect(places?.xp).toBe(20)
  })
})

describe('the areas on the sheet', () => {
  /*
   * The join is the point: an area earns a place here by being declared in
   * the registry, not by this file knowing about it. If these ever drift,
   * an absorbed area silently stops appearing.
   */
  it('are exactly the areas the registry declares', async () => {
    const sheet = await characterSheet(harness())

    expect(sheet.areas.map((area) => area.area)).toEqual(SCORING.map((area) => area.area))
  })
})

describe('counting acts', () => {
  it('counts a visited place once', async () => {
    const tally = await tallyActs(harness({ places: [aVisitedPlace('a'), aVisitedPlace('b')] }))

    expect(tally['places.place-visited']).toBe(2)
  })

  /*
   * A place saved by name and marked visited has no point on the map, and
   * "somewhere I have been" that the map cannot show is not evidence of
   * having been anywhere. Counting it would let a pasted list of twelve
   * names become 240 XP without leaving the house.
   */
  it('does not count a visited place that was never placed', async () => {
    const unplaced = { ...aVisitedPlace('a'), location: {} } as unknown as Place
    const tally = await tallyActs(harness({ places: [unplaced] }))

    expect(tally['places.place-visited']).toBe(0)
  })

  /*
   * The one act the registry declares that cannot be counted: a friend
   * record keeps the last hangout, not a list of them. Absent costs zero
   * XP; a friends-with-a-date count would stop growing after the first
   * coffee and read as a social life that happened once.
   */
  it('leaves hangouts uncounted rather than guessing at them', async () => {
    const tally = await tallyActs(harness())

    expect(tally['social.hangout-logged']).toBeUndefined()
  })

  it('pays no XP for an act it cannot witness', async () => {
    const sheet = await characterSheet(harness())
    const social = sheet.areas.find((area) => area.area === 'social')

    expect(social?.xp).toBe(0)
  })

  /*
   * Every act the registry declares should either be counted or knowingly
   * absent — this catches a new area arriving with an act nobody wired up,
   * which would otherwise show as a permanent zero nobody questions.
   */
  it('has a counted or deliberately absent entry for every declared act', async () => {
    const tally = await tallyActs(harness())
    const uncounted = ALL_ACTS.filter((act) => tally[act.id] === undefined).map((act) => act.id)

    // `jobs.*` belongs to an area that was deliberately not absorbed.
    expect(uncounted).toEqual(['social.hangout-logged', 'jobs.application-sent'])
  })
})

describe('the exploration ladder on the sheet', () => {
  it('reads a level once a region has been named and ground walked', async () => {
    const deps = harness({ settings: { exploredRegionKm2: 1 } })
    const sheet = await characterSheet(deps)
    const places = sheet.areas.find((area) => area.area === 'places')

    // No ground walked, so the share is a true zero rather than absent —
    // and zero is a reading, which puts it on the bottom rung.
    expect(places?.ladders[0]?.value).toBe(0)
    expect(places?.ladders[0]?.reading?.level).toBe('Untrained')
  })
})
