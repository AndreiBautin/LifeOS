import { readFileSync } from 'node:fs'

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createAccountHolder } from './account-holder'
import type { FirestoreCollectionDeps } from './collection'
import {
  createFirestoreFinance,
  createFirestoreResume,
  createFirestoreReview,
  createFirestoreWorkouts,
  RESUME_ID,
} from './repositories'

const OWNER = 'QmXEMrBsHSY286MCOn5YHDa4axm1'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'lift-e66c8',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

function deps(): FirestoreCollectionDeps {
  const account = createAccountHolder()
  account.set(OWNER)

  return {
    firestore: env.authenticatedContext(OWNER).firestore() as unknown as Firestore,
    account,
    clock: { now: () => new Date('2026-09-05T12:00:00Z') },
  }
}

/* A log with only the fields these queries read. */
const log = (id: string, date: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    date,
    status: 'completed',
    entries: [],
    ...over,
  }) as unknown as Parameters<ReturnType<typeof createFirestoreWorkouts>['save']>[0]

describe('workouts, whose queries are filters over the collection', () => {
  it('returns the most recent first and honours the limit', async () => {
    const workouts = createFirestoreWorkouts(deps())
    await workouts.restoreMany([
      log('a', '2026-09-01'),
      log('c', '2026-09-03'),
      log('b', '2026-09-02'),
    ])

    expect((await workouts.recent(2)).map((one) => one.id)).toEqual(['c', 'b'])
  })

  /*
   * Both ends of the range are optional. An absent one has to mean "no
   * bound" — compared against `undefined` every date is false, which
   * would quietly return nothing at all.
   */
  it('treats an open end of the range as unbounded', async () => {
    const workouts = createFirestoreWorkouts(deps())
    await workouts.restoreMany([
      log('a', '2026-09-01'),
      log('b', '2026-09-05'),
      log('c', '2026-09-09'),
    ])

    expect((await workouts.inRange({ from: '2026-09-04' })).map((one) => one.id)).toEqual([
      'c',
      'b',
    ])
    expect((await workouts.inRange({ to: '2026-09-04' })).map((one) => one.id)).toEqual(['a'])
    expect(await workouts.inRange({})).toHaveLength(3)
  })

  it('finds the open session and ignores the finished ones', async () => {
    const workouts = createFirestoreWorkouts(deps())
    await workouts.restoreMany([
      log('done', '2026-09-01'),
      log('open', '2026-09-02', { status: 'in-progress' }),
    ])

    expect((await workouts.inProgress())?.id).toBe('open')
  })

  it('says nothing when no session is open', async () => {
    const workouts = createFirestoreWorkouts(deps())
    await workouts.restoreMany([log('done', '2026-09-01')])

    expect(await workouts.inProgress()).toBeUndefined()
  })

  it('finds the sessions that trained an exercise', async () => {
    const workouts = createFirestoreWorkouts(deps())
    await workouts.restoreMany([
      log('bench', '2026-09-01', { entries: [{ exerciseId: 'bench-press' }] }),
      log('squat', '2026-09-02', { entries: [{ exerciseId: 'low-bar-squat' }] }),
    ])

    const found = await workouts.forExercise(
      'bench-press' as Parameters<ReturnType<typeof createFirestoreWorkouts>['forExercise']>[0],
    )

    expect(found.map((one) => one.id)).toEqual(['bench'])
  })
})

/*
 * Keyed by month rather than by `id`, which is the case `idOf` exists
 * for: keyed by a field the records do not carry, every row lands under
 * `undefined` and the collection collapses to one document.
 */
describe('records keyed by their month', () => {
  it('keeps one finance reading per month', async () => {
    const finance = createFirestoreFinance(deps())
    await finance.save({ month: '2026-08', creditScore: 700 })
    await finance.save({ month: '2026-09', creditScore: 710 })

    expect((await finance.all()).map((row) => row.month).sort()).toEqual(['2026-08', '2026-09'])
  })

  it('reads a monthly snapshot back by its month', async () => {
    const review = createFirestoreReview(deps())
    await review.saveSnapshot({ month: '2026-08', values: {} } as Parameters<
      ReturnType<typeof createFirestoreReview>['saveSnapshot']
    >[0])

    expect((await review.snapshot('2026-08'))?.month).toBe('2026-08')
    expect(await review.snapshot('2026-07')).toBeUndefined()
  })

  /*
   * Two collections behind one port, so a metric and a snapshot must not
   * land in the same place — the review screen reads both at once.
   */
  it('keeps metrics and snapshots apart', async () => {
    const review = createFirestoreReview(deps())
    await review.saveMetric({ id: 'm1', name: 'Sleep' } as Parameters<
      ReturnType<typeof createFirestoreReview>['saveMetric']
    >[0])
    await review.saveSnapshot({ month: '2026-08', values: {} } as Parameters<
      ReturnType<typeof createFirestoreReview>['saveSnapshot']
    >[0])

    expect(await review.metrics()).toHaveLength(1)
    expect(await review.snapshots()).toHaveLength(1)
  })
})

describe('the resume, which is one document rather than a collection', () => {
  it('round-trips under a fixed id', async () => {
    const resume = createFirestoreResume(deps())
    await resume.save({ name: 'Somebody', companies: [] } as unknown as Parameters<
      ReturnType<typeof createFirestoreResume>['save']
    >[0])

    expect((await resume.get())?.name).toBe('Somebody')
  })

  it('is absent before anything has been typed in', async () => {
    expect(await createFirestoreResume(deps()).get()).toBeUndefined()
  })

  it('overwrites rather than accumulating', async () => {
    const resume = createFirestoreResume(deps())
    const write = (name: string) =>
      resume.save({ name, companies: [] } as unknown as Parameters<typeof resume.save>[0])

    await write('First')
    await write('Second')

    expect((await resume.get())?.name).toBe('Second')
    expect(RESUME_ID).toBe('resume')
  })
})
