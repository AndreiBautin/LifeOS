import { describe, expect, it } from 'vitest'

import type { Clock } from '@/domain/repositories/ports'

import { forgetToday, onceADay, resultOf, type DailyRun, type DailyRunStore } from './once-a-day'

function store<T>(
  initial?: DailyRun<T>,
): DailyRunStore<T> & { readonly held: DailyRun<T> | undefined } {
  const held: { held: DailyRun<T> | undefined } = { held: initial }

  return {
    get held() {
      return held.held
    },
    get: () => held.held,
    save: (run) => {
      held.held = run
    },
  }
}

const at = (iso: string): Clock => ({ now: () => new Date(iso) })

describe('running something once a day', () => {
  it('runs on the first open of the day', async () => {
    let ran = 0
    const outcome = await onceADay(
      true,
      { store: store<string>(), clock: at('2026-08-31T08:00:00') },
      () => {
        ran += 1
        return Promise.resolve('thirty leads')
      },
    )

    expect(outcome).toEqual({ kind: 'ran', result: 'thirty leads', on: '2026-08-31' })
    expect(ran).toBe(1)
  })

  /*
   * The bug this file exists for. The first version kept a marker and no
   * result, so the second open of a day answered "already done" carrying
   * nothing — and a card showing thirty leads at eight in the morning
   * rendered blank at noon, with the day marked so it could not run
   * again.
   */
  it('remembers what it found, rather than going blank for the rest of the day', async () => {
    let ran = 0
    const held = store<string>()
    const deps = { store: held, clock: at('2026-08-31T08:00:00') }
    const work = () => {
      ran += 1
      return Promise.resolve('thirty leads')
    }

    await onceADay(true, deps, work)
    const second = await onceADay(true, { ...deps, clock: at('2026-08-31T19:00:00') }, work)

    expect(second).toEqual({ kind: 'remembered', result: 'thirty leads', on: '2026-08-31' })
    // Remembered, not re-fetched. The restraint is the whole point.
    expect(ran).toBe(1)
  })

  it('runs again the next day', async () => {
    let ran = 0
    const held = store<string>({ on: '2026-08-30', result: 'yesterday' })

    const outcome = await onceADay(true, { store: held, clock: at('2026-08-31T08:00:00') }, () => {
      ran += 1
      return Promise.resolve('today')
    })

    expect(outcome.kind).toBe('ran')
    expect(ran).toBe(1)
  })

  /*
   * A day key is local. In UTC the two agree and every assertion about
   * this would pass while the app was wrong for half of every evening,
   * which is why the suite runs in America/New_York.
   */
  it('treats an evening open as the same local day', async () => {
    let ran = 0
    const held = store<string>({ on: '2026-08-31', result: 'this morning' })

    // 21:00 in New York is already tomorrow in UTC.
    const outcome = await onceADay(true, { store: held, clock: at('2026-08-31T21:00:00') }, () => {
      ran += 1
      return Promise.resolve('again')
    })

    expect(outcome.kind).toBe('remembered')
    expect(ran).toBe(0)
  })

  /*
   * The mark goes down before the work. A source that hangs would
   * otherwise leave it unset and every reopening that day would retry
   * the whole list — one slow morning becoming a request loop against a
   * free API somebody else pays for.
   */
  it('marks the day even when the work throws', async () => {
    const held = store<string>()

    await expect(
      onceADay(true, { store: held, clock: at('2026-08-31T08:00:00') }, () =>
        Promise.reject(new Error('the network is down')),
      ),
    ).rejects.toThrow('the network is down')

    expect(held.held).toEqual({ on: '2026-08-31' })
  })

  it('reports a failed morning rather than retrying it', async () => {
    let ran = 0
    // The day is marked with no result: something ran and did not finish.
    const held = store<string>({ on: '2026-08-31' })

    const outcome = await onceADay(true, { store: held, clock: at('2026-08-31T19:00:00') }, () => {
      ran += 1
      return Promise.resolve('x')
    })

    expect(outcome).toEqual({ kind: 'failed-earlier', on: '2026-08-31' })
    expect(ran).toBe(0)
  })

  it('does nothing, and marks nothing, when there is nothing to do', async () => {
    // Otherwise adding a source at nine in the morning would wait until
    // tomorrow to be read, for no reason a person could see.
    const held = store<string>()

    const outcome = await onceADay(false, { store: held, clock: at('2026-08-31T08:00:00') }, () =>
      Promise.resolve('x'),
    )

    expect(outcome).toEqual({ kind: 'nothing-to-do' })
    expect(held.held).toBeUndefined()
  })
})

describe('reading an outcome', () => {
  it('gives the result whether it was just run or remembered', () => {
    expect(resultOf({ kind: 'ran', result: 7, on: '2026-08-31' })).toBe(7)
    expect(resultOf({ kind: 'remembered', result: 7, on: '2026-08-31' })).toBe(7)
  })

  it('gives nothing for the outcomes that carry nothing', () => {
    expect(resultOf({ kind: 'failed-earlier', on: '2026-08-31' })).toBeUndefined()
    expect(resultOf({ kind: 'nothing-to-do' })).toBeUndefined()
    expect(resultOf(undefined)).toBeUndefined()
  })
})

describe('forgetting today', () => {
  it('lets the work run again, which is what a manual refresh needs', async () => {
    let ran = 0
    const held = store<string>({ on: '2026-08-31', result: 'this morning' })

    forgetToday(held)
    await onceADay(true, { store: held, clock: at('2026-08-31T19:00:00') }, () => {
      ran += 1
      return Promise.resolve('again')
    })

    expect(ran).toBe(1)
  })
})
