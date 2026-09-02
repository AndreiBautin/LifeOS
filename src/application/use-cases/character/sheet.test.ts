import type { Attempt } from '@/domain/mind/practice'
import type { ChallengeMark } from '@/domain/challenges/challenge'
import { describe, expect, it } from 'vitest'

import { ALL_ACTS, SCORING } from '@/domain/game/registry'
import type { Place } from '@/domain/atlas/place/Place'
import type { Item } from '@/domain/backlog/item'
import { BASE } from '@/domain/base/base'
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
    readonly attempts?: Attempt[]
    readonly challenges?: ChallengeMark[]
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
    attempts: list(seed.attempts ?? []),
    challenges: list(seed.challenges ?? []),
    upgrades: list([]),
    workouts: list([]),
    friends: list([]),
    places: list(seed.places ?? []),
    dailies: list([]),
    rooms: list([]),
    vices: list([]),
    weighIns: list([]),
    finance: list([]),
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
    dateVisited: '2026-08-10T00:00:00.000Z',
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
   * Every act the registry declares should either be counted or knowingly
   * absent — this catches a new area arriving with an act nobody wired up,
   * which would otherwise show as a permanent zero nobody questions.
   */
  it('has a counted or deliberately absent entry for every declared act', async () => {
    const tally = await tallyActs(harness())
    const uncounted = ALL_ACTS.filter((act) => tally[act.id] === undefined).map((act) => act.id)

    /*
     * **Empty, and it got stronger when social went.** This used to
     * permit `social.hangout-logged`, the one act the registry declared
     * that `tallyActs` could not count — a friend kept a single ratcheted
     * `lastHangout` rather than a list of them. That area is gone, so
     * every act the registry declares is now actually wired, and the
     * exception this test carried can go with it.
     */
    expect(uncounted).toEqual([])
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

describe('what a quest step is worth', () => {
  const withAction = (kind: 'main' | 'side' | undefined, closedAs: 'main' | 'side' | undefined) =>
    ({
      id: 'q1',
      name: 'A quest',
      status: 'active',
      ...(kind === undefined ? {} : { kind }),
      actions: [
        {
          id: 'a1',
          description: 'A step',
          status: 'done',
          order: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
          completedAt: '2026-08-10T00:00:00.000Z',
          ...(closedAs === undefined ? {} : { completedAsKind: closedAs }),
        },
      ],
    }) as unknown as Project

  it('pays more for a main quest step', async () => {
    const sheet = await characterSheet(harness({ projects: [withAction('main', 'main')] }))

    expect(sheet.areas.find((area) => area.area === 'projects')?.xp).toBe(40)
  })

  it('pays less for a side quest step', async () => {
    const sheet = await characterSheet(harness({ projects: [withAction('side', 'side')] }))

    expect(sheet.areas.find((area) => area.area === 'projects')?.xp).toBe(20)
  })

  /*
   * The whole reason the kind is stamped on the action rather than read
   * off the quest. Demote a main quest and the work already done must keep
   * what it earned — XP is a record of effort, and a record of effort that
   * goes *down* because you renamed something is not a record of anything.
   */
  it('keeps what was earned when the quest is demoted afterwards', async () => {
    const demoted = withAction('side', 'main')

    const sheet = await characterSheet(harness({ projects: [demoted] }))

    expect(sheet.areas.find((area) => area.area === 'projects')?.xp).toBe(40)
  })

  /*
   * And the reverse: promoting a quest must not retroactively enrich work
   * that was done while it was a side quest.
   */
  it('does not repay old work when the quest is promoted', async () => {
    const promoted = withAction('main', 'side')

    const sheet = await characterSheet(harness({ projects: [promoted] }))

    expect(sheet.areas.find((area) => area.area === 'projects')?.xp).toBe(20)
  })

  /*
   * An action closed before quests had kinds carries no stamp, and counts
   * as a side quest — the same thing `kindOf` says about a quest with no
   * kind.
   */
  it('treats an unstamped closure as a side quest step', async () => {
    const legacy = withAction(undefined, undefined)

    const sheet = await characterSheet(harness({ projects: [legacy] }))

    expect(sheet.areas.find((area) => area.area === 'projects')?.xp).toBe(20)
  })
})

describe('what a job application pays', () => {
  const application = (over: Record<string, unknown> = {}) =>
    ({
      id: 'j1',
      name: 'Acme — Backend engineer',
      status: 'active',
      belongsTo: 'jobs',
      createdAt: '2026-08-10T00:00:00.000Z',
      actions: [
        {
          id: 's1',
          description: 'Screen',
          status: 'done',
          order: 1,
          createdAt: '2026-08-10T00:00:00.000Z',
          completedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      ...over,
    }) as unknown as Project

  it('pays for sending it', async () => {
    const sheet = await characterSheet(harness({ projects: [application()] }))

    expect(sheet.areas.find((area) => area.area === 'jobs')?.xp).toBe(30)
  })

  /*
   * The act/outcome line, which this area draws more sharply than any
   * other. Sending is a thing you decided to do; being given a screen is
   * a thing that happened to you. A closed stage records the date — that
   * is what `jobs.stage-advances-in-month` counts — and buys no points.
   */
  it('pays nothing extra for reaching a stage', async () => {
    const one = await characterSheet(harness({ projects: [application()] }))
    const two = await characterSheet(
      harness({
        projects: [
          application({
            actions: [
              {
                id: 's1',
                description: 'Screen',
                status: 'done',
                order: 1,
                createdAt: '2026-08-10T00:00:00.000Z',
                completedAt: '2026-08-12T00:00:00.000Z',
              },
              {
                id: 's2',
                description: 'Interview',
                status: 'done',
                order: 2,
                createdAt: '2026-08-10T00:00:00.000Z',
                completedAt: '2026-08-20T00:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    )

    expect(two.areas.find((area) => area.area === 'jobs')?.xp).toBe(
      one.areas.find((area) => area.area === 'jobs')?.xp,
    )
  })

  /*
   * Rule three, in the place it was most likely to break: an application
   * is a `Project`, so without the `isOwnArea` split its closed stages
   * would pay `projects.side-action-closed` as well.
   */
  it('does not also pay the quest log', async () => {
    const sheet = await characterSheet(harness({ projects: [application()] }))

    expect(sheet.areas.find((area) => area.area === 'projects')?.xp).toBe(0)
  })
})

/**
 * Crafting is split off two other areas, so the thing worth testing is
 * that nothing pays twice — rule three, at the one place it is easiest
 * to break.
 */
describe('what feeds Crafting', () => {
  const houseJob = (approach: 'diy' | 'hired' | undefined) =>
    ({
      id: 'j1',
      name: 'Fix the porch',
      status: 'active',
      belongsTo: BASE,
      ...(approach === undefined ? {} : { approach }),
      actions: [
        {
          id: 'a1',
          description: 'Do the work',
          status: 'done',
          order: 0,
          createdAt: '2026-08-01T00:00:00.000Z',
          completedAt: '2026-08-10T00:00:00.000Z',
          completedAsKind: 'side',
        },
      ],
    }) as unknown as Project

  const build = (category: string) =>
    ({
      id: 'b1',
      title: 'Millennium Falcon',
      category,
      status: 'active',
      dailyProgress: [{ date: '2026-08-10', amount: 3 }],
      dateCompleted: '2026-08-12',
    }) as unknown as Item

  const xpOf = (sheet: Awaited<ReturnType<typeof characterSheet>>, area: string) =>
    sheet.areas.find((one) => one.area === area)?.xp ?? 0

  it('pays a DIY house job into Crafting and not into Base', async () => {
    const sheet = await characterSheet(harness({ projects: [houseJob('diy')] }))

    expect(xpOf(sheet, 'crafting')).toBe(20)
    expect(xpOf(sheet, 'base')).toBe(0)
  })

  it('leaves a hired job paying Base, because getting a plumber in is not crafting', async () => {
    const sheet = await characterSheet(harness({ projects: [houseJob('hired')] }))

    expect(xpOf(sheet, 'base')).toBe(20)
    expect(xpOf(sheet, 'crafting')).toBe(0)
  })

  /*
   * Every house job filed before the field existed. Guessing from the
   * step list would hand Crafting XP out on a string match, so an absent
   * approach pays where it always paid.
   */
  it('pays a job with no recorded approach into Base, as it always did', async () => {
    const sheet = await characterSheet(harness({ projects: [houseJob(undefined)] }))

    expect(xpOf(sheet, 'base')).toBe(20)
    expect(xpOf(sheet, 'crafting')).toBe(0)
  })

  it('pays a Lego build into Crafting and not into the Codex', async () => {
    const sheet = await characterSheet(harness({ items: [build('lego')] }))

    // A progress day at 5 and a finish at 40, the backlog's own rates.
    expect(xpOf(sheet, 'crafting')).toBe(45)
    expect(xpOf(sheet, 'backlog')).toBe(0)
  })

  it('leaves every other category paying the Codex', async () => {
    const sheet = await characterSheet(harness({ items: [build('books')] }))

    expect(xpOf(sheet, 'backlog')).toBe(45)
    expect(xpOf(sheet, 'crafting')).toBe(0)
  })
})
