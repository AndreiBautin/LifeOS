import { describe, expect, it } from 'vitest'

import {
  editVice,
  listVices,
  recordWeighIn,
  spendVice,
  vitalsToday,
  type VitalsDeps,
} from './vitals'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { asViceId } from '@/domain/ids/ids'
import type { Vice } from '@/domain/vitals/charges'
import type { DayCondition } from '@/domain/vitals/condition'
import type { WeighIn } from '@/domain/vitals/weight'

/**
 * The read model behind the two bars on Today.
 *
 * What is worth holding here is not the arithmetic — that lives in
 * `domain/vitals/` and is tested there — but the two decisions this
 * layer makes: that an unrecorded condition is **absent rather than
 * neutral**, and that the pools are ordered by what is left rather than
 * by name.
 */

const NOW = new Date('2026-08-27T10:00:00.000Z')

function deps(seed: {
  vices?: Vice[]
  weighIns?: WeighIn[]
  conditions?: DayCondition[]
  phase?: (typeof DEFAULT_SETTINGS)['phase']
}): VitalsDeps {
  const vices = seed.vices ?? []
  const weighIns = seed.weighIns ?? []

  return {
    vices: {
      all: () => Promise.resolve(vices),
      byId: (id) => Promise.resolve(vices.find((one) => one.id === id)),
      save: (vice) => {
        const at = vices.findIndex((one) => one.id === vice.id)
        if (at >= 0) vices[at] = vice
        else vices.push(vice)
        return Promise.resolve()
      },
      restoreMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      purge: () => Promise.resolve(),
    },
    weighIns: {
      all: () => Promise.resolve(weighIns),
      save: (row) => {
        const at = weighIns.findIndex((one) => one.day === row.day)
        if (at >= 0) weighIns[at] = row
        else weighIns.push(row)
        return Promise.resolve()
      },
      restoreMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      purge: () => Promise.resolve(),
    },
    conditions: {
      all: () => Promise.resolve(seed.conditions ?? []),
      save: () => Promise.resolve(),
      restoreMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      purge: () => Promise.resolve(),
    },
    settings: {
      get: () =>
        Promise.resolve({ ...DEFAULT_SETTINGS, ...(seed.phase ? { phase: seed.phase } : {}) }),
      save: () => Promise.resolve(),
    },
    clock: { now: () => NOW },
    ids: { next: () => 'generated' },
  }
}

const pool = (name: string, capacity: number, spent: readonly string[]): Vice => ({
  id: asViceId(name),
  name,
  capacity,
  regenHours: 12,
  spent,
  createdAt: '2026-08-01T00:00:00.000Z',
})

describe("what Today's card is handed", () => {
  it('says nothing about condition when nothing was recorded', async () => {
    // Absent, never neutral. A bar at the midpoint would be a claim that
    // the day is unremarkable, which is not the same as not being asked.
    const view = await vitalsToday(deps({}))

    expect(view.condition).toBeUndefined()
  })

  it('reads a condition recorded today and ignores yesterday’s', async () => {
    const readiness = {
      sleep: 'good',
      nutrition: 'good',
      hydration: 'good',
      stress: 'good',
      motivation: 'good',
    } as const

    const view = await vitalsToday(
      deps({
        conditions: [
          { day: '2026-08-26', readiness },
          {
            day: '2026-08-27',
            readiness: { ...readiness, sleep: 'poor', stress: 'poor' },
          },
        ],
      }),
    )

    // Three good and two poor is a score of 1 on a range of ±5.
    expect(view.condition?.fraction).toBeCloseTo(0.6, 5)
  })

  /*
   * Emptiest first, because the list exists to say what is left. Sorting
   * by name would put the pool you have not touched at the top of it.
   */
  it('puts the pool nearest empty at the top', async () => {
    const view = await vitalsToday(
      deps({
        vices: [
          pool('Beer', 4, []),
          pool('Coffee', 2, ['2026-08-27T08:00:00.000Z', '2026-08-27T09:00:00.000Z']),
          pool('Kush', 2, ['2026-08-27T09:00:00.000Z']),
        ],
      }),
    )

    expect(view.pools.map((one) => one.vice.name)).toEqual(['Coffee', 'Kush', 'Beer'])
  })

  it('leaves a retired pool off the card entirely', async () => {
    const retired: Vice = { ...pool('Beer', 4, []), retiredAt: '2026-08-20T00:00:00.000Z' }

    expect((await vitalsToday(deps({ vices: [retired] }))).pools).toEqual([])
  })

  it('counts only today’s spends as today’s', async () => {
    const view = await vitalsToday(
      deps({
        vices: [pool('Coffee', 2, ['2026-08-26T08:00:00.000Z', '2026-08-27T09:00:00.000Z'])],
      }),
    )

    expect(view.pools[0]?.spentToday).toBe(1)
  })

  it('reports the phase as unknown rather than on track with no readings', async () => {
    const view = await vitalsToday(deps({}))

    expect(view.phase.verdict).toBe('unknown')
    expect(view.phase.trend).toBeUndefined()
  })
})

describe('recording', () => {
  it('spends a charge even when the pool is empty', async () => {
    // Never refuses — see the note on `spendVice`. An app that refused
    // would be asking to be lied to.
    const services = deps({ vices: [pool('Coffee', 1, ['2026-08-27T09:00:00.000Z'])] })

    await spendVice(asViceId('Coffee'), services)

    const view = await vitalsToday(services)

    expect(view.pools[0]?.reading.over).toBe(1)
    expect(view.pools[0]?.reading.available).toBe(0)
  })

  it('replaces rather than appends a second weigh-in on one day', async () => {
    const services = deps({})

    await recordWeighIn(181, services)
    await recordWeighIn(182.4, services)

    expect((await vitalsToday(services)).phase.today).toBe(182.4)
  })

  it('ignores a weight that is not a number it can use', async () => {
    const services = deps({})

    await recordWeighIn(Number.NaN, services)
    await recordWeighIn(-5, services)

    expect((await vitalsToday(services)).phase.today).toBeUndefined()
  })
})

describe('changing what a pool measures', () => {
  const pool = (over: Partial<Vice>): Vice => ({
    id: asViceId('alcohol'),
    name: 'Alcohol',
    capacity: 4,
    cycle: { kind: 'calendar', period: 'week' },
    spent: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  })

  /*
   * The gap this closes: a pool's unit was fixed at creation, so a
   * mislabelled one could only be retired and rebuilt — throwing away
   * everything it had recorded to fix a word.
   */
  it('sets a unit on a pool that had none', async () => {
    const services = deps({ vices: [pool({ spent: ['2026-08-28T20:00:00.000Z'] })] })

    await editVice(
      asViceId('alcohol'),
      { name: 'Alcohol', capacity: 4, cycle: { kind: 'calendar', period: 'week' }, unit: 'drinks' },
      services,
    )

    const after = (await listVices(services))[0]

    expect(after?.unit).toBe('drinks')
    // The history is untouched — this is a relabel, not a conversion.
    expect(after?.spent).toEqual(['2026-08-28T20:00:00.000Z'])
  })

  it('clears a unit, turning a measured pool back into a count', async () => {
    const services = deps({ vices: [pool({ unit: 'drinks' })] })

    await editVice(
      asViceId('alcohol'),
      { name: 'Alcohol', capacity: 4, cycle: { kind: 'calendar', period: 'week' } },
      services,
    )

    // Absent, not an empty string: a stored unit still draws a bar, and
    // one left behind after the editor cleared it is the worst of both.
    expect((await listVices(services))[0]?.unit).toBeUndefined()
  })

  it('flips a limit into a target', async () => {
    const services = deps({ vices: [pool({ name: 'Water', direction: 'limit' })] })

    await editVice(
      asViceId('alcohol'),
      {
        name: 'Water',
        capacity: 3000,
        cycle: { kind: 'calendar', period: 'day' },
        unit: 'ml',
        direction: 'target',
      },
      services,
    )

    expect((await listVices(services))[0]?.direction).toBe('target')
  })
})
