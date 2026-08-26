import { describe, expect, it } from 'vitest'

import { creditFor, type CreditSources, type ProgressEvent } from './credit'

const sources: CreditSources = {
  acts: [{ id: 'training.session-finished', area: 'training', label: 'Finished', points: 50 }],
  ladders: [
    {
      id: 'training.squat',
      source: 'training.squat-e1rm',
      name: 'Squat',
      unit: 'lb',
      anchor: 'Published standards',
      thresholds: [0.75, 1.25, 1.5, 2.25, 2.75],
    },
  ],
  ratings: [
    {
      id: 'backlog.age',
      source: 'backlog.median-age-days',
      name: 'Backlog age',
      unit: 'days',
      direction: 'decrease',
      cadence: 'monthly',
    },
  ],
}

const at = '2026-08-26T09:00:00.000Z'

describe('creditFor', () => {
  it('pays an act into the pool', () => {
    const event: ProgressEvent = { kind: 'act', act: 'training.session-finished', at }

    expect(creditFor(event, sources)).toEqual({ to: 'xp', points: 50 })
  })

  it('sends a measurement to the ladder that names it as its source', () => {
    const event: ProgressEvent = {
      kind: 'measurement',
      source: 'training.squat-e1rm',
      value: 315,
      at,
    }

    expect(creditFor(event, sources)).toEqual({ to: 'ladder', id: 'training.squat', value: 315 })
  })

  it('sends a measurement to a rating when no ladder claims it', () => {
    const event: ProgressEvent = {
      kind: 'measurement',
      source: 'backlog.median-age-days',
      value: 61,
      at,
    }

    expect(creditFor(event, sources)).toEqual({ to: 'rating', id: 'backlog.age', value: 61 })
  })

  /*
   * A record from a newer build, arriving over sync. Ignoring the row
   * beats refusing the batch it came in.
   */
  it('ignores an act it has never heard of', () => {
    const event: ProgressEvent = { kind: 'act', act: 'jobs.application-sent', at }

    expect(creditFor(event, sources)).toBeUndefined()
  })

  it('ignores a measurement nothing claims', () => {
    const event: ProgressEvent = {
      kind: 'measurement',
      source: 'places.explored-share',
      value: 0.4,
      at,
    }

    expect(creditFor(event, sources)).toBeUndefined()
  })

  /*
   * The third rule, where it can actually be caught.
   *
   * The return type already says "one credit or none" — the point of
   * testing it is that a future change wanting a session to move
   * consistency *as well* will reach for an array here first, and this is
   * the line it has to delete to do that.
   */
  it('never returns more than one credit for one event', () => {
    const event: ProgressEvent = { kind: 'act', act: 'training.session-finished', at }
    const credit = creditFor(event, sources)

    expect(Array.isArray(credit)).toBe(false)
  })
})
