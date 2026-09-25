import { describe, expect, it } from 'vitest'

import { atlasView } from '@/application/use-cases/atlas/atlas'
import { characterSheet } from '@/application/use-cases/character/sheet'
import { goalStandings } from '@/application/use-cases/goals/goals'
import { listProjects } from '@/application/use-cases/projects/projects'
import { shelfTree } from '@/application/use-cases/upgrades/upgrades'
import { nextAvailableItem } from '@/domain/goals/goal'
import { UNCLAIMED_AREAS } from '@/domain/game/traits'
import type { Clock } from '@/domain/repositories/ports'

import { seedDemoData } from './seed'
import type { DemoDeps } from './deps'

/**
 * **The failure this file exists for is unique to having a demo**, and it
 * is silent from both ends: a feature works perfectly against real data
 * and renders an empty box on the deployed site, because the fixture has
 * nothing in it that exercises that screen. Nothing errors. The tests
 * that cover the feature go on passing, because the feature is fine. The
 * person who notices is the employer.
 *
 * So this asserts the fixture's **obligations as properties** — "the
 * traits are not all empty", "every shelf of the tree has something on
 * it" — rather than as a list of the titles it happens to contain.
 * Editing the fixture stays free; hollowing it out does not.
 *
 * It reads the same use cases the screens read, one layer below the
 * components. That buys most of what rendering would and costs a
 * fraction of it — what it cannot catch is a screen that has data and
 * draws it wrongly, which is what driving the app is for.
 */

const NOW = new Date('2026-09-05T12:00:00.000Z')
const clock: Clock = { now: () => NOW }

function store<T extends { id?: unknown; month?: unknown; day?: unknown }>(
  key: 'id' | 'month' | 'day' = 'id',
) {
  const rows = new Map<string, T>()
  const idOf = (row: T) => String(row[key])
  const write = (many: readonly T[]) => {
    for (const row of many) rows.set(idOf(row), row)
    return Promise.resolve()
  }

  return {
    rows,
    all: () => Promise.resolve([...rows.values()]),
    recent: () => Promise.resolve([...rows.values()]),
    byId: (id: string) => Promise.resolve(rows.get(id)),
    save: (row: T) => {
      rows.set(idOf(row), row)
      return Promise.resolve()
    },
    saveMany: write,
    restoreMany: write,
    remove: (id: string) => {
      rows.delete(id)
      return Promise.resolve()
    },
    purge: (id: string) => {
      rows.delete(id)
      return Promise.resolve()
    },
    clear: () => {
      rows.clear()
      return Promise.resolve()
    },
    count: () => Promise.resolve(rows.size),
  }
}

function services() {
  let next = 0
  let settings: Record<string, unknown> = {}
  let resume: Record<string, unknown> | undefined
  const resumeRepo = {
    get: () => Promise.resolve(resume),
    save: (next: Record<string, unknown>) => {
      resume = next
      return Promise.resolve()
    },
    clear: () => {
      resume = undefined
      return Promise.resolve()
    },
  }

  const cells = new Set<string>()

  const parts = {
    items: store(),
    projects: store(),
    upgrades: store(),
    rooms: store(),
    finance: store('month'),
    campaigns: store(),
    goals: store(),
    vices: store(),
    places: store(),
    workouts: store(),
    attempts: store(),
    challenges: store(),
    trips: store(),
    weighIns: store('day'),
  }

  /*
   * The review spine is the one repository the sheet reads that is not a
   * collection of records — it holds metric *definitions* and monthly
   * snapshots. Nothing files a month any more, so both are empty here,
   * which is exactly the state the deployed app is in.
   */
  const review = {
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
    ...parts,
    review,
    explored: {
      all: () => Promise.resolve(cells as ReadonlySet<string>),
      reveal: (many: readonly string[]) => {
        const before = cells.size
        for (const cell of many) cells.add(cell)
        return Promise.resolve(cells.size - before)
      },
      clear: () => {
        cells.clear()
        return Promise.resolve()
      },
      count: () => Promise.resolve(cells.size),
    },
    resume: resumeRepo,
    settings: {
      get: () => Promise.resolve(settings),
      save: (next_: Record<string, unknown>) => {
        settings = next_
        return Promise.resolve()
      },
    },
    ids: { next: () => `demo-${String((next += 1))}` },
    clock,
  } as unknown as DemoDeps & Parameters<typeof characterSheet>[0] & typeof parts
}

async function seeded() {
  const deps = services()
  await seedDemoData(deps)
  return deps
}

describe('what a reviewer sees on the landing page', () => {
  it('is past the first level, so the ring is not empty', async () => {
    const sheet = await characterSheet(await seeded())

    expect(sheet.standing.level).toBeGreaterThan(1)
    expect(sheet.standing.xp).toBeGreaterThan(0)
  })

  /*
   * Not *every* trait — the sheet keeps unproven bars on purpose,
   * because "eight bars with three empty says where the time is going".
   * What must not happen is all of them reading "Nothing yet", which is
   * the landing page of an app nobody has used.
   */
  it('has proved more than one trait', async () => {
    const sheet = await characterSheet(await seeded())
    const proven = sheet.traits.filter((trait) => trait.xp > 0)

    expect(proven.length).toBeGreaterThan(1)
  })

  /*
   * The partition is what makes rule three hold by construction, and a
   * fixture is the only thing that can demonstrate it holding. If these
   * ever disagree, an area is paying XP into the level and into no bar.
   */
  it('splits its XP across the traits without inventing any', async () => {
    const sheet = await characterSheet(await seeded())

    const inTraits = sheet.traits.reduce((sum, trait) => sum + trait.xp, 0)
    const unclaimed = sheet.areas
      .filter((area) => (UNCLAIMED_AREAS as readonly string[]).includes(area.area))
      .reduce((sum, area) => sum + area.xp, 0)

    expect(inTraits + unclaimed).toBe(sheet.standing.xp)
  })

  /*
   * An area with nothing to say says nothing, which is correct
   * behaviour and a demonstration of an empty app. Some of them must
   * have something.
   */
  it('leaves fewer than half the areas silent', async () => {
    const sheet = await characterSheet(await seeded())
    const silent = sheet.areas.filter((area) => area.silent)

    expect(silent.length).toBeLessThan(sheet.areas.length / 2)
  })
})

describe('what a reviewer sees on the other screens', () => {
  it('draws both halves of the quest board', async () => {
    const deps = await seeded()
    const open = await listProjects(deps, 'own-area')
    const house = await listProjects(deps, 'base')

    expect(open.length).toBeGreaterThan(1)
    expect(house.length).toBeGreaterThan(0)
    expect(open.some((project) => project.status === 'completed')).toBe(true)
  })

  /*
   * **Owned and dropped both fold away behind the eye**, so a fixture of
   * open upgrades alone leaves that control with nothing behind it and
   * the screen looking like it has a dead button.
   */
  it('covers every status the tech tree can draw', async () => {
    const deps = await seeded()
    const all = await deps.upgrades.all()
    const statuses = new Set(all.map((one) => (one as { status: string }).status))

    expect(statuses.has('purchased')).toBe(true)
    expect(statuses.has('cancelled')).toBe(true)
    expect(all.some((one) => (one as { status: string }).status === 'idea')).toBe(true)
  })

  it('puts something on both shelves of the tree', async () => {
    const deps = await seeded()

    expect((await shelfTree('base', 0, deps)).length).toBeGreaterThan(0)
    expect((await shelfTree('tech', 0, deps)).length).toBeGreaterThan(0)
  })

  /*
   * The map is the screen that fails this way most quietly: places and
   * fog are separate readings, and a fixture with places but nothing
   * visited draws a full list over an unbroken grey sheet.
   */
  it('gives the map both places and cleared ground', async () => {
    const view = await atlasView(await seeded())

    expect(view.places.length).toBeGreaterThan(4)
    expect(view.cellCount).toBeGreaterThan(0)
  })

  /*
   * **The resume is the one record nothing regenerates**, so its empty
   * screen reads as a broken feature rather than an untouched one. Two
   * roles at one employer is the case the `Company` type exists for —
   * a promotion, which a flat list of jobs prints as job-hopping.
   */
  it('fills the resume, promotion included', async () => {
    const deps = await seeded()
    const cv = (await deps.resume.get()) as
      { companies: readonly { roles: readonly unknown[] }[] } | undefined

    expect(cv?.companies.length ?? 0).toBeGreaterThan(1)
    expect(cv?.companies.some((one) => one.roles.length > 1)).toBe(true)
  })

  /*
   * A trip is a few saved places and the days you will be near them, so
   * one filed against no places demonstrates an empty list rather than a
   * trip.
   */
  it('plans trips against places that exist', async () => {
    const deps = await seeded()
    const trips = (await deps.trips.all()) as readonly { placeIds: readonly string[] }[]
    const places = new Set(
      ((await deps.places.all()) as readonly { id: string }[]).map((p) => p.id),
    )

    expect(trips.length).toBeGreaterThan(1)
    expect(trips.every((t) => t.placeIds.length > 0)).toBe(true)
    expect(trips.every((t) => t.placeIds.every((id) => places.has(id)))).toBe(true)
  })

  /*
   * The job screen is about **how far each one has got**, so a fixture
   * where every application sits at nought demonstrates the list and not
   * the thing the list is for.
   */
  it('has an application that has got somewhere', async () => {
    const deps = await seeded()
    const jobs = (await listProjects(deps, 'jobs')) as readonly {
      actions: readonly { status: string }[]
    }[]

    expect(jobs.length).toBeGreaterThan(1)
    expect(jobs.some((j) => j.actions.some((a) => a.status === 'done'))).toBe(true)
  })

  /*
   * Without a daily goal the Codex draws its own empty state on a screen
   * full of books, and the home screen loses the row that ties the two
   * together.
   */
  it('sets a reading goal, so the Codex has a today', async () => {
    const deps = await seeded()
    const items = (await deps.items.all()) as readonly { dailyGoal?: unknown }[]

    expect(items.some((one) => one.dailyGoal !== undefined)).toBe(true)
  })
  it('gives the money screen more than one month to compare', async () => {
    const deps = await seeded()

    expect((await deps.finance.all()).length).toBeGreaterThanOrEqual(3)
  })

  /*
   * The goal screen fails this way most easily of all: a goal with one
   * workstream and no dependency reads exactly like a to-do list, which
   * is the one thing this feature exists to be more than.
   */
  it('gives the goal several workstreams and a real dependency', async () => {
    const deps = await seeded()
    const goals = (await deps.goals.all()) as readonly {
      items: readonly { workstream: string; dependsOn: readonly string[] }[]
    }[]

    expect(goals.length).toBeGreaterThan(0)
    const workstreams = new Set(goals.flatMap((goal) => goal.items.map((one) => one.workstream)))
    expect(workstreams.size).toBeGreaterThan(3)
    expect(goals.some((goal) => goal.items.some((one) => one.dependsOn.length > 0))).toBe(true)
  })

  /*
   * The Today screen's goals card is silent when nothing is available to
   * work on next -- correct behaviour, and exactly the kind of correct
   * behaviour that quietly hides an empty fixture. Without this, every
   * item could be settled or blocked and the reviewer's first screen
   * would never show the card at all.
   */
  it('leaves the goal something available, so the Today card has one to show', async () => {
    const standings = await goalStandings(await seeded())
    expect(standings.some((standing) => nextAvailableItem(standing) !== undefined)).toBe(true)
  })
})
