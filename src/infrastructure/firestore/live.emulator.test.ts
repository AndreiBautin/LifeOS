import { readFileSync } from 'node:fs'

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import type { Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { createAccountHolder } from './account-holder'
import type { FirestoreCollectionDeps } from './collection'
import { createFirestoreRooms } from './repositories'
import { LIVE_COLLECTIONS, watchRecords } from './live'

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

/* Two contexts, so one can play the other device. */
function deps(): FirestoreCollectionDeps {
  const account = createAccountHolder()
  account.set(OWNER)

  return {
    firestore: env.authenticatedContext(OWNER).firestore() as unknown as Firestore,
    account,
    clock: { now: () => new Date('2026-09-05T12:00:00Z') },
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 600))

describe('noticing that the other device wrote', () => {
  it('calls back with the collection that changed', async () => {
    const watcher = deps()
    const other = deps()

    const changed: string[] = []
    const stop = watchRecords(watcher, (name) => changed.push(name))
    await settle()
    changed.length = 0

    await createFirestoreRooms(other).save({
      id: 'kitchen',
      name: 'Kitchen',
      readings: [],
      createdAt: '2026-09-05T12:00:00.000Z',
    } as unknown as Parameters<ReturnType<typeof createFirestoreRooms>['save']>[0])

    await settle()
    stop()

    expect(changed).toContain('rooms')
  })

  /*
   * The loop this guards: a save raises a snapshot on the writing device
   * too, and treating that as news would invalidate the query that just
   * wrote it, refetch, and do it again.
   */
  it('ignores this device’s own write', async () => {
    const mine = deps()

    const changed: string[] = []
    const stop = watchRecords(mine, (name) => changed.push(name))
    await settle()
    changed.length = 0

    await createFirestoreRooms(mine).save({
      id: 'garage',
      name: 'Garage',
      readings: [],
      createdAt: '2026-09-05T12:00:00.000Z',
    } as unknown as Parameters<ReturnType<typeof createFirestoreRooms>['save']>[0])

    await settle()
    stop()

    expect(changed).toEqual([])
  })

  it('stops listening when detached', async () => {
    const watcher = deps()
    const other = deps()

    const changed: string[] = []
    const stop = watchRecords(watcher, (name) => changed.push(name))
    await settle()
    stop()
    changed.length = 0

    await createFirestoreRooms(other).save({
      id: 'loft',
      name: 'Loft',
      readings: [],
      createdAt: '2026-09-05T12:00:00.000Z',
    } as unknown as Parameters<ReturnType<typeof createFirestoreRooms>['save']>[0])

    await settle()

    expect(changed).toEqual([])
  })

  /*
   * A collection nobody watches is a screen that silently never
   * refreshes, which looks exactly like the app being slow rather than
   * like a missing subscription.
   */
  it('watches every collection the repositories write to', () => {
    for (const name of ['workouts', 'items', 'projects', 'vices', 'finance', 'campaigns']) {
      expect(LIVE_COLLECTIONS).toContain(name)
    }
  })
})
