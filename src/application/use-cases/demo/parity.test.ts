import { describe, expect, it } from 'vitest'

import { characterSheet } from '@/application/use-cases/character/sheet'
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

function store<T extends { id?: unknown; month?: unknown }>(key: 'id' | 'month' = 'id') {
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

  const parts = { workouts: store() }

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
   * All three, now there are three and every one is fed by the same
   * sessions: a demo with an empty Mobility bar would be a fixture that
   * never logged a warm-up, which is not what four months of training
   * looks like.
   */
  it('has proved every trait', async () => {
    const sheet = await characterSheet(await seeded())

    expect(sheet.traits.every((trait) => trait.xp > 0)).toBe(true)
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
})
