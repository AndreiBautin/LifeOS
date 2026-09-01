import { describe, expect, it } from 'vitest'

import {
  addDaily,
  keepOn,
  keepToday,
  recadenceDaily,
  relabelDaily,
  undoOn,
  undoToday,
  type DailyDeps,
} from './dailies'
import { isDoneOn, timesDoneOn } from '@/domain/dailies/daily'
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

    await relabelDaily(
      asDailyId('water'),
      { title: 'Gallon of water', group: undefined, home: undefined },
      services,
    )

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

    const result = await relabelDaily(
      asDailyId('water'),
      { title: '   ', group: undefined, home: undefined },
      services,
    )

    expect(result.error).toBeDefined()
    expect(services.stored[0]?.title).toBe('Water')
  })

  it('trims, so a stray space does not become part of the name', async () => {
    const services = deps([habit()])

    await relabelDaily(
      asDailyId('water'),
      { title: '  Gallon of water  ', group: undefined, home: undefined },
      services,
    )

    expect(services.stored[0]?.title).toBe('Gallon of water')
  })

  it('does nothing for an id that is not there', async () => {
    const services = deps([habit()])

    const result = await relabelDaily(
      asDailyId('missing'),
      { title: 'Something else', group: undefined, home: undefined },
      services,
    )

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

    await relabelDaily(
      asDailyId('water'),
      { title: 'Water', group: 'Hydration', home: undefined },
      services,
    )

    expect(services.stored[0]?.group).toBe('Hydration')
    expect(services.stored[0]?.done).toEqual(['2026-08-29', '2026-08-30'])
  })

  it('takes a habit out of a group when the field is cleared', async () => {
    const services = deps([{ ...habit(), group: 'Supplements' }])

    await relabelDaily(asDailyId('water'), { title: 'Water', group: '', home: undefined }, services)

    // Removed, not set to undefined: a key holding undefined is a key,
    // and it would travel over sync as one.
    expect('group' in (services.stored[0] ?? {})).toBe(false)
  })
})

/*
 * The gap this closes, reported from real use: a habit asked for three
 * times a day sat at 2 of 3 on *yesterday*, and nothing anywhere could
 * correct it. Ticking only ever worked on the day itself, so a third
 * feed forgotten at eleven at night was gone for good — and it is also
 * the only repair for an entry misfiled by the timezone bug this app
 * shipped five times, since nothing rewrites stored entries.
 */
describe('ticking a day that is not today', () => {
  it('records a completion against the day it belonged to', async () => {
    const services = deps([{ ...habit(), done: [] }])

    await keepOn(asDailyId('water'), '2026-08-29', services)

    expect(services.stored[0]?.done).toEqual(['2026-08-29'])
  })

  it('finishes a day that was left part done', async () => {
    // Two of three yesterday, which is the shape that was reported.
    const services = deps([
      {
        ...habit(),
        timesPerDay: 3,
        done: ['2026-08-29T08:00:00.000', '2026-08-29T13:00:00.000'],
      },
    ])

    await keepOn(asDailyId('water'), '2026-08-29', services)

    expect(timesDoneOn(services.stored[0] ?? habit(), '2026-08-29')).toBe(3)
    expect(isDoneOn(services.stored[0] ?? habit(), '2026-08-29')).toBe(true)
  })

  /*
   * No `at`, so the entry is midnight of the day it belongs to rather
   * than the time it was typed. A backfilled tick knows which day it was
   * and does not know what time of that day — stamping "now" would file
   * a Tuesday completion with Thursday's clock.
   */
  it('does not stamp it with the time it was recorded', async () => {
    const services = deps([{ ...habit(), timesPerDay: 2, done: [] }])

    await keepOn(asDailyId('water'), '2026-08-29', services)

    expect(services.stored[0]?.done[0]).toBe('2026-08-29T00:00:00.000')
  })

  /*
   * Ticking tomorrow is not forgetfulness, it is a claim about something
   * that has not happened — and a streak built on it would be the one
   * number here that means nothing.
   */
  it('refuses a day that has not happened', async () => {
    const services = deps([habit()])

    const result = await keepOn(asDailyId('water'), '2099-01-01', services)

    expect(result.error).toBeDefined()
    expect(services.stored[0]?.done).not.toContain('2099-01-01')
  })

  it('allows today itself, which is not the future', async () => {
    const services = deps([habit()])

    expect((await keepOn(asDailyId('water'), '2026-08-30', services)).error).toBeUndefined()
  })

  it('will not push a day past what it asked for', async () => {
    const services = deps([
      { ...habit(), timesPerDay: 2, done: ['2026-08-29T08:00:00.000', '2026-08-29T13:00:00.000'] },
    ])

    await keepOn(asDailyId('water'), '2026-08-29', services)

    expect(timesDoneOn(services.stored[0] ?? habit(), '2026-08-29')).toBe(2)
  })

  it('takes one back off a past day, leaving the rest', async () => {
    const services = deps([
      { ...habit(), timesPerDay: 3, done: ['2026-08-29T08:00:00.000', '2026-08-29T13:00:00.000'] },
    ])

    await undoOn(asDailyId('water'), '2026-08-29', services)

    expect(timesDoneOn(services.stored[0] ?? habit(), '2026-08-29')).toBe(1)
  })
})

/*
 * The edit the rename form deliberately excluded. The reason it was
 * excluded still holds — a cadence decides which days were expected, so
 * changing it re-reads every streak — but the alternative was worse:
 * a habit on the wrong cadence could only be retired and retyped, and
 * that throws away the run of days, which is a habit's whole value.
 */
describe('changing a cadence', () => {
  it('changes which days are expected', async () => {
    const services = deps([habit()])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'days-of-week', days: [1] }, timesPerDay: 1, partsOfDay: [] },
      services,
    )

    expect(services.stored[0]?.cadence).toEqual({ kind: 'days-of-week', days: [1] })
  })

  it('keeps every day it was kept on', async () => {
    const kept = ['2026-08-28', '2026-08-29', '2026-08-30']
    const services = deps([{ ...habit(), done: kept }])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'days-of-week', days: [1] }, timesPerDay: 1, partsOfDay: [] },
      services,
    )

    expect(services.stored[0]?.done).toEqual(kept)
  })

  it('changes the times a day, and drops the field when it is one', async () => {
    const services = deps([{ ...habit(), timesPerDay: 3 }])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'every-day' }, timesPerDay: 1, partsOfDay: [] },
      services,
    )

    // Removed, not set to undefined: a key holding undefined is a key,
    // and it would travel over sync as one.
    expect('timesPerDay' in (services.stored[0] ?? {})).toBe(false)
  })

  it('never lets the times a day fall below one', async () => {
    const services = deps([habit()])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'every-day' }, timesPerDay: 0, partsOfDay: [] },
      services,
    )

    expect('timesPerDay' in (services.stored[0] ?? {})).toBe(false)
  })
})

/*
 * The reported gap: *"existing dailies, particularly the ones from home,
 * don't seem to be able to update the time of day — they're all at any
 * time."* They could not. `partOfDay` was settable on the add form and
 * nowhere else, so a chore filed before anybody thought about it was
 * stuck reading "Any time" forever.
 */
describe('changing when in the day a habit sits', () => {
  it('sets the parts on a habit that had none', async () => {
    const services = deps([habit()])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'every-day' }, timesPerDay: 1, partsOfDay: ['evening', 'morning'] },
      services,
    )

    // In the order the day happens, whatever order they were tapped in.
    expect(services.stored[0]?.partsOfDay).toEqual(['morning', 'evening'])
  })

  it('clears them back to any time', async () => {
    const services = deps([{ ...habit(), partsOfDay: ['morning'] as const }])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'every-day' }, timesPerDay: 1, partsOfDay: [] },
      services,
    )

    expect('partsOfDay' in (services.stored[0] ?? {})).toBe(false)
  })

  it('normalises the single-part shape rather than leaving it behind', async () => {
    // A stored `partOfDay` that survived the write would have `partsOf`
    // reading a stale answer the moment the list was cleared.
    const services = deps([{ ...habit(), partOfDay: 'morning' as const }])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'every-day' }, timesPerDay: 1, partsOfDay: ['evening'] },
      services,
    )

    expect('partOfDay' in (services.stored[0] ?? {})).toBe(false)
    expect(services.stored[0]?.partsOfDay).toEqual(['evening'])
  })

  it('drops the times a day, because the parts are the count', async () => {
    const services = deps([{ ...habit(), timesPerDay: 3 }])

    await recadenceDaily(
      asDailyId('water'),
      { cadence: { kind: 'every-day' }, timesPerDay: 3, partsOfDay: ['morning', 'evening'] },
      services,
    )

    // Two answers to "how many times a day" on one record is how the
    // loser ends up sitting there looking authoritative.
    expect('timesPerDay' in (services.stored[0] ?? {})).toBe(false)
    expect(services.stored[0]?.partsOfDay).toEqual(['morning', 'evening'])
  })
})

describe('ticking one part of the day', () => {
  const brushing = () => ({ ...habit(), partsOfDay: ['morning', 'evening'] as const, done: [] })

  it('keeps that part and leaves the other outstanding', async () => {
    const services = deps([brushing()])

    await keepToday(asDailyId('water'), services, 'morning')

    expect(services.stored[0]?.done).toEqual(['2026-08-30#morning'])
  })

  it('takes back the part it is given, not the last one written', async () => {
    const services = deps([{ ...brushing(), done: ['2026-08-30#morning', '2026-08-30#evening'] }])

    await undoToday(asDailyId('water'), services, 'morning')

    expect(services.stored[0]?.done).toEqual(['2026-08-30#evening'])
  })

  it('is idempotent, so two devices ticking one morning is one morning', async () => {
    const services = deps([{ ...brushing(), done: ['2026-08-30#morning'] }])

    await keepToday(asDailyId('water'), services, 'morning')

    // No second entry: the domain returned the same object, so nothing
    // was written and no sync traffic was produced.
    expect(services.stored[0]?.done).toEqual(['2026-08-30#morning'])
  })
})

/*
 * Reported: *"with uncategorised dailies I still can't move them into
 * the home section with all the other house tasks."* The screen drew a
 * House heading and the control that picks a heading could not choose
 * it, because House is a home and that field only ever set a group.
 */
describe('filing a habit to a section', () => {
  it('moves an ungrouped habit into House', async () => {
    const services = deps([habit()])

    await relabelDaily(
      asDailyId('water'),
      { title: 'Water', group: undefined, home: 'base' },
      services,
    )

    expect(services.stored[0]?.belongsTo).toBe('base')
  })

  it('sends it back to its own area, rather than leaving the key behind', async () => {
    const services = deps([{ ...habit(), belongsTo: 'base' as const }])

    await relabelDaily(
      asDailyId('water'),
      { title: 'Water', group: undefined, home: undefined },
      services,
    )

    // Dropped, not set to undefined: a key holding undefined is a key,
    // and it would travel over sync as one.
    expect('belongsTo' in (services.stored[0] ?? {})).toBe(false)
  })

  it('writes the name, the group and the home in one save', async () => {
    // Three fields of one record. Sent separately they are two
    // read-modify-writes of the same row and one of them is lost — the
    // bug `reshapeStage` exists for.
    const services = deps([habit()])

    await relabelDaily(
      asDailyId('water'),
      { title: 'Hoover the hall', group: 'Pet care', home: 'base' },
      services,
    )

    const after = services.stored[0]
    expect(after?.title).toBe('Hoover the hall')
    expect(after?.group).toBe('Pet care')
    expect(after?.belongsTo).toBe('base')
  })

  it('keeps every day it was kept on, because a move is not a re-create', async () => {
    const kept = ['2026-08-28', '2026-08-29']
    const services = deps([{ ...habit(), done: kept }])

    await relabelDaily(
      asDailyId('water'),
      { title: 'Water', group: undefined, home: 'base' },
      services,
    )

    expect(services.stored[0]?.done).toEqual(kept)
  })
})
