import { describe, expect, it } from 'vitest'

import { renameDaily, type DailyDeps } from './dailies'
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

describe('renameDaily', () => {
  it('keeps every day the habit was kept on', async () => {
    const services = deps([habit()])

    await renameDaily(asDailyId('water'), 'Gallon of water', services)

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

    const result = await renameDaily(asDailyId('water'), '   ', services)

    expect(result.error).toBeDefined()
    expect(services.stored[0]?.title).toBe('Water')
  })

  it('trims, so a stray space does not become part of the name', async () => {
    const services = deps([habit()])

    await renameDaily(asDailyId('water'), '  Gallon of water  ', services)

    expect(services.stored[0]?.title).toBe('Gallon of water')
  })

  it('does nothing for an id that is not there', async () => {
    const services = deps([habit()])

    const result = await renameDaily(asDailyId('missing'), 'Something else', services)

    expect(result.error).toBeUndefined()
    expect(services.stored).toHaveLength(1)
    expect(services.stored[0]?.title).toBe('Water')
  })
})
