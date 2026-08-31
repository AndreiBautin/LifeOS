import { describe, expect, it } from 'vitest'

import type { FetchedPosting } from '@/domain/jobs/boards'
import { EMPTY_JOB_SEARCH, type JobSearch } from '@/domain/jobs/search'
import type { Clock, JobBoardGateway } from '@/domain/repositories/ports'

import { sweepIfDue, type SweepMarker, type SweepMarkerStore } from './daily-sweep'

function posting(title: string): FetchedPosting {
  return {
    externalId: title,
    title,
    description: 'Work on things',
    url: `https://example.test/${title}`,
    boardToken: 'acme',
    provider: 'greenhouse',
    isRemote: true,
  }
}

/** Counts reads, because the whole point of the gate is how many happen. */
function boards(): JobBoardGateway & { reads: number } {
  const gateway = {
    reads: 0,
    fetch: (_provider: unknown, _token: string) => {
      gateway.reads += 1
      return Promise.resolve([posting('Engineer')])
    },
  }

  return gateway
}

function marker(initial: SweepMarker = {}): SweepMarkerStore & { held: SweepMarker } {
  const store = {
    held: initial,
    get: () => store.held,
    save: (next: SweepMarker) => {
      store.held = next
    },
  }

  return store
}

const at = (iso: string): Clock => ({ now: () => new Date(iso) })

const withBoards: JobSearch = {
  ...EMPTY_JOB_SEARCH,
  sources: [{ provider: 'greenhouse', token: 'acme' }],
}

describe('sweeping once a day', () => {
  it('reads the boards on the first open of the day', async () => {
    const gateway = boards()

    const outcome = await sweepIfDue(withBoards, {
      boards: gateway,
      clock: at('2026-08-31T08:00:00'),
      sweepMarker: marker(),
    })

    expect(outcome.kind).toBe('swept')
    expect(gateway.reads).toBe(1)
  })

  it('does nothing on the second open of the same day', async () => {
    const gateway = boards()
    const held = marker({ sweptOn: '2026-08-31' })

    const outcome = await sweepIfDue(withBoards, {
      boards: gateway,
      clock: at('2026-08-31T19:00:00'),
      sweepMarker: held,
    })

    expect(outcome.kind).toBe('already-swept')
    expect(gateway.reads).toBe(0)
  })

  it('reads again the next day', async () => {
    const gateway = boards()

    const outcome = await sweepIfDue(withBoards, {
      boards: gateway,
      clock: at('2026-09-01T08:00:00'),
      sweepMarker: marker({ sweptOn: '2026-08-31' }),
    })

    expect(outcome.kind).toBe('swept')
    expect(gateway.reads).toBe(1)
  })

  /*
   * The day key is local, like every other day key in the app. In UTC a
   * local key and a UTC prefix are the same ten characters, which is why
   * the suite runs in America/New_York — an evening open would otherwise
   * count as tomorrow and sweep a second time.
   */
  it('treats an evening open as the same local day', async () => {
    const gateway = boards()

    const outcome = await sweepIfDue(withBoards, {
      boards: gateway,
      // 21:00 in New York is the following day in UTC.
      clock: at('2026-08-31T21:00:00'),
      sweepMarker: marker({ sweptOn: '2026-08-31' }),
    })

    expect(outcome.kind).toBe('already-swept')
    expect(gateway.reads).toBe(0)
  })

  it('reads nothing when no boards are configured', async () => {
    const gateway = boards()

    const outcome = await sweepIfDue(EMPTY_JOB_SEARCH, {
      boards: gateway,
      clock: at('2026-08-31T08:00:00'),
      sweepMarker: marker(),
    })

    expect(outcome.kind).toBe('nothing-to-read')
    expect(gateway.reads).toBe(0)
  })

  it('does not mark a day swept when there was nothing to read', async () => {
    // Otherwise adding a board at nine in the morning would wait until
    // tomorrow to read it, for no reason a person could see.
    const held = marker()

    await sweepIfDue(EMPTY_JOB_SEARCH, {
      boards: boards(),
      clock: at('2026-08-31T08:00:00'),
      sweepMarker: held,
    })

    expect(held.held.sweptOn).toBeUndefined()
  })

  /*
   * The marker is written *before* the read, and this is the test that
   * says so. A board that hangs would otherwise leave it unset, and
   * every reopening that day would retry the whole list — one slow
   * morning turning into a request loop against a free API somebody else
   * pays for.
   */
  it('marks the day even when every board fails', async () => {
    const failing = {
      fetch: () => Promise.reject(new Error('network is down')),
    } as unknown as JobBoardGateway
    const held = marker()

    const outcome = await sweepIfDue(withBoards, {
      boards: failing,
      clock: at('2026-08-31T08:00:00'),
      sweepMarker: held,
    })

    expect(held.held.sweptOn).toBe('2026-08-31')
    // Named rather than thrown, the rule `sweepBoards` already follows.
    expect(outcome.kind === 'swept' && outcome.sweep.failures).toHaveLength(1)
  })
})
