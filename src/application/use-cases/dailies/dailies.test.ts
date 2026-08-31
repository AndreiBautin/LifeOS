import { describe, expect, it } from 'vitest'

import { addDaily, relabelDaily, type DailyDeps } from './dailies'
import { asDailyId } from '@/domain/ids/ids'
import type { Daily } from '@/domain/dailies/daily'

/**
 * Renaming a habit.
 *
 * The arithmetic of streaks and completions lives in `domain/dailies/`
 * and is tested there. What is worth holding at this layer is the pair
 * of things a rename must not do: lose the days the habit was kept on,
 * which are its entire value, and accept a blank name, which would put
 * an unnamed row on three screens with no way to correct it except a
 * second rename.
 */

const NOW = new Date('2026-08-30T10:00:00.000Z')

function deps(seed: Daily[]): DailyDeps & { readonly stored: Daily[] } {
  return {
    stored: seed,
    dailies: {
      all: () => Promise.resolve(seed),
      byId: (id) => Promise.resolve(seed.find((one) => one.id === id)),
      save: (daily) => {
        const at = seed.findIndex((one) => one.id === daily.id)
        if (at >= 0) seed[at] = daily
        else seed.push(daily)
        return Promise.resolve()
      },
      restoreMany: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      purge: () => Promise.resolve(),
    },
    clock: { now: () => NOW },
    ids: { next: () => 'generated' },
  }
}

function habit(over: Partial<Daily> = {}): Daily {
  return {
    id: asDailyId('water'),
    title: 'Water',
    cadence: { kind: 'every-day' },
    done: ['2026-08-28', '2026-08-29', '2026-08-30'],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

describe('relabelDaily', () => {
  it('keeps every day the habit was kept on', async () => {
    const services = deps([habit()])

    await relabelDaily(asDailyId('water'), 'Gallon of water', undefined, services)

    const after = services.stored[0]
    expect(after?.title).toBe('Gallon of water')
    /*
     * The reason renaming had to exist at all. Retiring and retyping was
     * the only way to correct a name, and it cost the run of days — so a
     * rename that dropped them would leave the app exactly where it
     * started, by a route that looks like it worked.
     */
    expect(after?.done).toEqual(['2026-08-28', '2026-08-29', '2026-08-30'])
    expect(after?.createdAt).toBe('2026-08-01T00:00:00.000Z')
  })

  it('refuses a blank name and leaves the record alone', async () => {
    const services = deps([habit()])

    const result = await relabelDaily(asDailyId('water'), '   ', undefined, services)

    expect(result.error).toBeDefined()
    expect(services.stored[0]?.title).toBe('Water')
  })

  it('trims, so a stray space does not become part of the name', async () => {
    const services = deps([habit()])

    await relabelDaily(asDailyId('water'), '  Gallon of water  ', undefined, services)

    expect(services.stored[0]?.title).toBe('Gallon of water')
  })

  it('does nothing for an id that is not there', async () => {
    const services = deps([habit()])

    const result = await relabelDaily(asDailyId('missing'), 'Something else', undefined, services)

    expect(result.error).toBeUndefined()
    expect(services.stored).toHaveLength(1)
    expect(services.stored[0]?.title).toBe('Water')
  })
})

/*
 * The group joins the title on the label side of the line: neither
 * changes what the record meant, so neither re-reads a streak. A cadence
 * would, which is why it is still not here.
 */
describe('grouping a habit', () => {
  it('files a new habit under a group', async () => {
    const services = deps([])

    await addDaily(
      { title: 'Creatine', cadence: { kind: 'every-day' }, group: '  Supplements ' },
      services,
    )

    expect(services.stored[0]?.group).toBe('Supplements')
  })

  it('leaves a habit with no group ungrouped rather than empty', async () => {
    // A stored '' is a state every future reader has to have explained.
    const services = deps([])

    await addDaily({ title: 'Creatine', cadence: { kind: 'every-day' }, group: '   ' }, services)

    expect(services.stored[0]?.group).toBeUndefined()
    expect('group' in (services.stored[0] ?? {})).toBe(false)
  })

  it('changes the group without touching the days it was kept', async () => {
    const services = deps([{ ...habit(), done: ['2026-08-29', '2026-08-30'] }])

    await relabelDaily(asDailyId('water'), 'Water', 'Hydration', services)

    expect(services.stored[0]?.group).toBe('Hydration')
    expect(services.stored[0]?.done).toEqual(['2026-08-29', '2026-08-30'])
  })

  it('takes a habit out of a group when the field is cleared', async () => {
    const services = deps([{ ...habit(), group: 'Supplements' }])

    await relabelDaily(asDailyId('water'), 'Water', '', services)

    // Removed, not set to undefined: a key holding undefined is a key,
    // and it would travel over sync as one.
    expect('group' in (services.stored[0] ?? {})).toBe(false)
  })
})
