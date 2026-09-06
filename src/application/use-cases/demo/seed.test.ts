import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { Clock } from '@/domain/repositories/ports'

import { seedDemoData } from './seed'
import type { DemoDeps } from './deps'

const NOW = new Date('2026-09-05T12:00:00.000Z')
const clock: Clock = { now: () => NOW }

/** An in-memory stand-in for one collection. */
function store<T extends { id?: unknown; month?: unknown }>(key: 'id' | 'month' = 'id') {
  const rows = new Map<string, T>()
  const idOf = (row: T) => String(row[key])

  return {
    rows,
    all: () => Promise.resolve([...rows.values()]),
    byId: (id: string) => Promise.resolve(rows.get(id)),
    save: (row: T) => {
      rows.set(idOf(row), row)
      return Promise.resolve()
    },
    saveMany: (many: readonly T[]) => {
      for (const row of many) rows.set(idOf(row), row)
      return Promise.resolve()
    },
    restoreMany: (many: readonly T[]) => {
      for (const row of many) rows.set(idOf(row), row)
      return Promise.resolve()
    },
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

function deps() {
  let next = 0

  const parts = {
    items: store(),
    projects: store(),
    upgrades: store(),
    rooms: store(),
    finance: store('month'),
    campaigns: store(),
    vices: store(),
    attempts: store(),
    challenges: store(),
    trips: store(),
    places: store(),
    workouts: store(),
  }

  /*
   * The fog has no id and no timestamp — it is a grow-only set of cell
   * ids — so it cannot go through `store`. Nothing here writes to it;
   * visited places light it through `allExploredCells`.
   */
  /* One record rather than a collection, so it is not a `store`. */
  let settings: Record<string, unknown> = {}
  const settingsRepo = {
    get: () => Promise.resolve(settings),
    save: (next: Record<string, unknown>) => {
      settings = next
      return Promise.resolve()
    },
  }

  /** A singleton, like the settings — one document under a fixed id. */
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
  const explored = {
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
  }

  return {
    ...parts,
    explored,
    settings: settingsRepo,
    resume: resumeRepo,
    read: () => settings,
    /* Deterministic, so a fixture is the same every run. */
    ids: { next: () => `demo-${String((next += 1))}` },
    clock,
  } as unknown as DemoDeps & typeof parts & { read: () => Record<string, unknown> }
}

/** Every id in the map fixture, so a coordinate cannot hide in a comment. */
const COORDINATE_LINES = /(latitude|longitude):\s*-?\d/g

describe('seeding the demo', () => {
  it('fills every collection a screen reads', async () => {
    const services = deps()
    const result = await seedDemoData(services)

    expect(result.seeded).toBe(true)
    expect(services.items.rows.size).toBeGreaterThan(8)
    expect(services.projects.rows.size).toBeGreaterThan(2)
    expect(services.upgrades.rows.size).toBeGreaterThan(2)
    expect(services.rooms.rows.size).toBeGreaterThan(3)
    expect(services.campaigns.rows.size).toBe(1)
    expect(services.places.rows.size).toBeGreaterThan(4)
    expect(services.workouts.rows.size).toBeGreaterThan(2)
  })

  /*
   * **A visited place is what clears the fog**, through
   * `allExploredCells` rather than through a fixture of its own — so a
   * map with nothing visited demonstrates an exploration ladder reading
   * nothing on a screen whose whole point is the ground covered.
   */
  it('leaves some of the map already walked', async () => {
    const services = deps()
    await seedDemoData(services)

    const places = [...services.places.rows.values()] as { dateVisited?: string }[]
    expect(places.filter((place) => place.dateVisited !== undefined).length).toBeGreaterThan(1)
  })

  /*
   * The demo has to show the app's own resolution refusing to guess, so
   * one capture is deliberately name-only — the state the inbox exists
   * for. A fixture where every place resolves has nothing to put there.
   */
  /*
   * The exploration ladder reads *absent* without a region area — which
   * is right, and shows a reader nothing. This asserts the denominator
   * is stated, and that stating it did not take the rest of settings
   * with it.
   */
  it('names a region so the exploration ladder has a denominator', async () => {
    const services = deps()
    await services.settings.save({ daysPerWeek: 3 } as never)
    await seedDemoData(services)

    const after = services.read()
    expect(after.exploredRegionKm2).toBeGreaterThan(0)
    expect(after.daysPerWeek).toBe(3)
  })

  it('leaves one place without a point, for the inbox', async () => {
    const services = deps()
    await seedDemoData(services)

    const places = [...services.places.rows.values()] as {
      location: { coordinates?: unknown }
    }[]
    expect(places.some((place) => place.location.coordinates === undefined)).toBe(true)
  })

  /*
   * Stamina is paid by `hasConditioning`, which asks whether a
   * conditioning set was *completed* rather than whether one was
   * scheduled — so a fixture of empty slots leaves that bar reading
   * "Nothing yet" while the records look like a full week.
   */
  it('completes the conditioning it schedules', async () => {
    const services = deps()
    await seedDemoData(services)

    const logs = [...services.workouts.rows.values()] as {
      entries: readonly { role: string; sets: readonly { outcome: string }[] }[]
    }[]
    const conditioning = logs.flatMap((log) =>
      log.entries.filter((one) => one.role === 'conditioning'),
    )

    expect(conditioning.length).toBeGreaterThan(0)
    expect(conditioning.every((one) => one.sets.some((set) => set.outcome === 'completed'))).toBe(
      true,
    )
  })

  /*
   * **Two points make a direction; one makes a number.** Every trend on
   * the finance screen compares months, so a fixture with one month
   * demonstrates nothing the screen is for.
   */
  it('gives the money screen more than one month to compare', async () => {
    const services = deps()
    await seedDemoData(services)

    expect(services.finance.rows.size).toBeGreaterThanOrEqual(3)
  })

  /*
   * The barrier that matters most. Seeding must fill empty storage and
   * never overwrite — a demo build opened by somebody who has since
   * entered their own records must not lose them.
   */
  it('refuses when there is already something there', async () => {
    const services = deps()
    await seedDemoData(services)

    const before = services.items.rows.size
    const again = await seedDemoData(services)

    expect(again.seeded).toBe(false)
    expect(again.reason).toBe('already-has-data')
    expect(services.items.rows.size).toBe(before)
  })

  it('is deterministic for a given clock', async () => {
    const first = deps()
    const second = deps()
    await seedDemoData(first)
    await seedDemoData(second)

    expect([...first.items.rows.keys()].sort()).toEqual([...second.items.rows.keys()].sort())
  })

  /*
   * **Dates are offsets, never absolutes.** A fixture pinned to fixed
   * timestamps rots: opened a year later it shows dead streaks and an
   * empty "this month". Asserted by seeding at two different clocks and
   * requiring the output to move with them.
   */
  it('moves with the clock rather than pinning dates', async () => {
    const later = deps()
    const shifted: Clock = { now: () => new Date('2027-03-01T12:00:00.000Z') }
    await seedDemoData({ ...later, clock: shifted })

    const months = [...later.finance.rows.keys()]
    expect(months.every((month) => month.startsWith('2027') || month.startsWith('2026-1'))).toBe(
      true,
    )
  })
})

/*
 * **The fixture is published, so it is scanned rather than trusted.**
 * The risk this guards is not a typo — it is somebody pasting a real
 * record in while debugging and forgetting. A test reading its own source
 * catches that without anybody having to remember.
 */
describe('what the fixture must not contain', () => {
  const source = readFileSync('src/application/use-cases/demo/seed.ts', 'utf8')

  it('has no email addresses', () => {
    expect(source).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  it('has no phone numbers', () => {
    expect(source).not.toMatch(/\+?\d[\d\s().-]{8,}\d/)
  })

  /*
   * The scan above and the map fixture below it are in tension: a
   * latitude is a run of digits and dots, which is most of what a phone
   * number looks like. They coexist because a coordinate is too short —
   * and that is asserted rather than assumed, since a fixture that
   * silently stopped containing coordinates would pass the same way.
   */
  it('still carries the coordinates the map needs', () => {
    expect(source.match(COORDINATE_LINES)?.length ?? 0).toBeGreaterThan(8)
  })

  it('has nothing shaped like a credential', () => {
    expect(source).not.toMatch(/AIza[\w-]{10,}|sk-[\w]{10,}|-----BEGIN/)
  })

  /*
   * A URL is not automatically personal, but every one in a fixture is
   * either a placeholder nobody checked or a link to something real.
   * Neither belongs in published demonstration data.
   */
  it('has no links out', () => {
    expect(source).not.toMatch(/https?:\/\//)
  })
})
