import type { DayReading } from '@/domain/vitals/day-reading'
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
import type { WeighIn } from '@/domain/vitals/weight'

/**
 * The read model behind the two bars on Today.
 *
 * What is worth holding here is not the arithmetic — that lives in
 * `domain/vitals/` and is tested there — but the two decisions this
 * layer makes: that that the pools are ordered by what is left rather than
 * by name.
 */

const NOW = new Date('2026-08-27T10:00:00.000Z')

function deps(seed: {
  vices?: Vice[]
  weighIns?: WeighIn[]
  dayReadings?: DayReading[]
  phase?: (typeof DEFAULT_SETTINGS)['phase']
}): VitalsDeps {
  const vices = seed.vices ?? []
  const weighIns = seed.weighIns ?? []
  const dayReadings: DayReading[] = seed.dayReadings ?? []

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
    /*
     * Backed by a real array rather than stubbed empty, so the tests
     * below can put a day in and watch it reach the read model.
     */
    dayReadings: {
      all: () => Promise.resolve(dayReadings),
      byDay: (day: string) => Promise.resolve(dayReadings.find((one) => one.day === day)),
      save: (row) => {
        const at = dayReadings.findIndex((one) => one.day === row.day)
        if (at >= 0) dayReadings[at] = row
        else dayReadings.push(row)
        return Promise.resolve()
      },
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

describe('changing the quick amounts', () => {
  const caffeine = (presets: { label: string; amount: number }[]): Vice => ({
    id: asViceId('caffeine'),
    name: 'Caffeine',
    capacity: 400,
    unit: 'mg',
    cycle: { kind: 'calendar', period: 'day' },
    presets,
    spent: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  })

  const edit = (presets?: { label: string; amount: number }[]) => ({
    name: 'Caffeine',
    capacity: 400,
    cycle: { kind: 'calendar' as const, period: 'day' as const },
    unit: 'mg',
    ...(presets === undefined ? {} : { presets }),
  })

  /*
   * Replaced wholesale, not merged. The editor shows the whole list, so
   * a merge would make a removed row reappear — the one thing a list
   * editor must not do.
   */
  it('replaces the list rather than merging into it', async () => {
    const services = deps({
      vices: [
        caffeine([
          { label: 'Tea', amount: 47 },
          { label: 'Espresso', amount: 65 },
        ]),
      ],
    })

    await editVice(
      asViceId('caffeine'),
      edit([
        { label: 'Soda', amount: 45 },
        { label: 'Pre-workout', amount: 200 },
      ]),
      services,
    )

    const after = (await listVices(services))[0]

    expect(after?.presets?.map((one) => one.label)).toEqual(['Soda', 'Pre-workout'])
  })

  it('clears them all when the last row is removed', async () => {
    const services = deps({ vices: [caffeine([{ label: 'Tea', amount: 47 }])] })

    await editVice(asViceId('caffeine'), edit([]), services)

    // Absent rather than an empty array — the card reads `presets ?? []`
    // either way, and a stored empty list is a thing that has to be
    // explained to every future reader.
    expect((await listVices(services))[0]?.presets).toBeUndefined()
  })
})

/*
 * The wiring, not the arithmetic. `day-standing.test.ts` covers what the
 * bands mean; this covers that a day somebody entered actually reaches
 * the screen — which is the step this codebase has watched go missing
 * more than once.
 */
describe('what the recorded days contribute', () => {
  it('carries sleep through to the read model with a verdict', async () => {
    const today = await vitalsToday(
      deps({
        dayReadings: [
          { day: '2026-08-26', sleepHours: 6 },
          { day: '2026-08-27', sleepHours: 6.5 },
        ],
      }),
    )

    expect(today.days.sleep?.average).toBe(6.3)
    expect(today.days.sleep?.standing).toBe('short')
  })

  /*
   * Absent, never zero. A fortnight nobody entered has nothing to say,
   * which is different from saying it went badly.
   */
  it('says nothing when no day has been recorded', async () => {
    const today = await vitalsToday(deps({}))

    expect(today.days.sleep).toBeUndefined()
    expect(today.days.calories).toBeUndefined()
    expect(today.cut).toBeUndefined()
  })

  /*
   * The cut line needs both halves: a rate from the scale and an intake
   * from the days. Half of it is not a sentence.
   */
  it('reports the cut only once both the scale and the intake have spoken', async () => {
    const withoutWeighIns = await vitalsToday(
      deps({ dayReadings: [{ day: '2026-08-27', calories: 2400 }] }),
    )

    expect(withoutWeighIns.days.calories?.average).toBe(2400)
    expect(withoutWeighIns.cut).toBeUndefined()
  })
})
