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

  const parts = { workouts: store() }

  /* One record rather than a collection, so it is not a `store`. */
  let settings: Record<string, unknown> = {}
  const settingsRepo = {
    get: () => Promise.resolve(settings),
    save: (next: Record<string, unknown>) => {
      settings = next
      return Promise.resolve()
    },
  }

  return {
    ...parts,
    settings: settingsRepo,
    read: () => settings,
    /* Deterministic, so a fixture is the same every run. */
    ids: { next: () => `demo-${String((next += 1))}` },
    clock,
  } as unknown as DemoDeps & typeof parts & { read: () => Record<string, unknown> }
}

interface Logged {
  date: string
  entries: readonly { role: string; sets: readonly { outcome: string }[] }[]
}

const logsOf = (services: ReturnType<typeof deps>): Logged[] =>
  [...services.workouts.rows.values()] as Logged[]

describe('seeding the demo', () => {
  it('fills the training history', async () => {
    const services = deps()
    const result = await seedDemoData(services)

    expect(result.seeded).toBe(true)
    expect(services.workouts.rows.size).toBeGreaterThan(30)
  })

  /*
   * The note under Settings reads `sampleData`, and nothing else about
   * the settings is the fixture's business — a stated training week must
   * survive the seed.
   */
  it('marks the sample as loaded without taking the rest of settings', async () => {
    const services = deps()
    await services.settings.save({ daysPerWeek: 3 } as never)
    await seedDemoData(services)

    const after = services.read()
    expect(after.sampleData).toBe('loaded')
    expect(after.daysPerWeek).toBe(3)
  })

  /*
   * A fixture of scheduled rows with nothing done against them would read
   * as four months of sessions walked away from halfway, so the warm-up
   * and the conditioning are logged as completed.
   */
  it.each(['conditioning', 'warmup'])('completes the %s it schedules', async (role) => {
    const services = deps()
    await seedDemoData(services)

    const rows = logsOf(services).flatMap((log) => log.entries.filter((one) => one.role === role))

    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((one) => one.sets.some((set) => set.outcome === 'completed'))).toBe(true)
  })

  /*
   * The barrier that matters most. Seeding must fill empty storage and
   * never overwrite — a demo build opened by somebody who has since
   * entered their own records must not lose them.
   */
  it('refuses when there is already something there', async () => {
    const services = deps()
    await seedDemoData(services)

    const before = services.workouts.rows.size
    const again = await seedDemoData(services)

    expect(again.seeded).toBe(false)
    expect(again.reason).toBe('already-has-data')
    expect(services.workouts.rows.size).toBe(before)
  })

  it('is deterministic for a given clock', async () => {
    const first = deps()
    const second = deps()
    await seedDemoData(first)
    await seedDemoData(second)

    expect(logsOf(first).map((log) => log.date)).toEqual(logsOf(second).map((log) => log.date))
  })

  /*
   * **Dates are offsets, never absolutes.** A fixture pinned to fixed
   * timestamps rots: opened a year later it shows dead streaks and an
   * empty "this month". Asserted by seeding at a different clock and
   * requiring the output to move with it.
   */
  it('moves with the clock rather than pinning dates', async () => {
    const later = deps()
    const shifted: Clock = { now: () => new Date('2027-03-01T12:00:00.000Z') }
    await seedDemoData({ ...later, clock: shifted })

    const dates = logsOf(later).map((log) => log.date)
    expect(dates.every((date) => date >= '2026-10' && date < '2027-03-02')).toBe(true)
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
