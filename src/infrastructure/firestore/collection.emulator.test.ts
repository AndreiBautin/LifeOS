import { readFileSync } from 'node:fs'

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase/firestore'

import { createAccountHolder } from './account-holder'
import { createFirestoreCollection } from './collection'

/**
 * The owner uid the rules name. Anything else is denied by design, which
 * is asserted here as well — a repository that quietly worked for the
 * wrong account would be the worst possible pass.
 */
const OWNER = 'QmXEMrBsHSY286MCOn5YHDa4axm1'

interface Room {
  readonly id: string
  readonly name: string
  readonly clear?: number | undefined
  readonly updatedAt?: string | undefined
}

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

function repository(uid: string = OWNER) {
  const account = createAccountHolder()
  account.set(uid)

  return {
    account,
    rooms: createFirestoreCollection<Room>(
      {
        firestore: env.authenticatedContext(uid).firestore() as unknown as Firestore,
        account,
        clock: { now: () => new Date('2026-09-05T12:00:00Z') },
      },
      'rooms',
    ),
  }
}

describe('a collection of records under an account', () => {
  it('saves and reads one back', async () => {
    const { rooms } = repository()
    await rooms.save({ id: 'kitchen', name: 'Kitchen', clear: 40 })

    expect(await rooms.byId('kitchen')).toMatchObject({ name: 'Kitchen', clear: 40 })
  })

  it('says nothing rather than throwing for a record that is not there', async () => {
    const { rooms } = repository()
    expect(await rooms.byId('loft')).toBeUndefined()
  })

  it('stamps a save so two copies can be ordered', async () => {
    const { rooms } = repository()
    await rooms.save({ id: 'kitchen', name: 'Kitchen' })

    expect((await rooms.byId('kitchen'))?.updatedAt).toBe('2026-09-05T12:00:00.000Z')
  })

  /*
   * The import path must not stamp. Doing so would make every restored
   * record the newest thing in the database, which is the one comparison
   * a restore has to leave alone.
   */
  it('leaves a restored record exactly as given', async () => {
    const { rooms } = repository()
    await rooms.restoreMany([{ id: 'attic', name: 'Attic', updatedAt: '2020-01-01T00:00:00.000Z' }])

    expect((await rooms.byId('attic'))?.updatedAt).toBe('2020-01-01T00:00:00.000Z')
  })

  /*
   * Firestore refuses `undefined` outright, so an optional field nobody
   * has set has to be dropped rather than sent. Sending `null` instead
   * would come back as a present field holding null, which is not the
   * same as absent under `exactOptionalPropertyTypes`.
   */
  it('drops an unset optional field rather than failing the write', async () => {
    const { rooms } = repository()
    await rooms.save({ id: 'shed', name: 'Shed', clear: undefined })

    const stored = await rooms.byId('shed')
    expect(stored).toMatchObject({ name: 'Shed' })
    expect(stored && 'clear' in stored).toBe(false)
  })

  it('lists everything and counts it without reading it twice', async () => {
    const { rooms } = repository()
    await rooms.saveMany([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ])

    expect((await rooms.all()).map((room) => room.id).sort()).toEqual(['a', 'b', 'c'])
    expect(await rooms.count()).toBe(3)
  })

  /*
   * **A delete is a delete, and that is the point of the migration.**
   * With one authoritative copy there is nothing to tell "removed" from
   * "never seen", so the tombstone the IndexedDB repositories write has
   * nothing left to do.
   */
  it('removes a record with no tombstone left behind', async () => {
    const { rooms } = repository()
    await rooms.save({ id: 'garage', name: 'Garage' })
    await rooms.remove('garage')

    expect(await rooms.byId('garage')).toBeUndefined()
    expect(await rooms.count()).toBe(0)
  })

  it('clears the whole collection', async () => {
    const { rooms } = repository()
    await rooms.saveMany([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
    await rooms.clear()

    expect(await rooms.all()).toEqual([])
  })

  /*
   * Nothing should reach this — `AuthGate` wraps every screen that
   * queries anything — but reading `users/undefined/...` would return an
   * empty collection and look exactly like an account with no data,
   * which is a failure this app has already spent an afternoon on.
   */
  it('refuses to read before anybody has signed in', async () => {
    const account = createAccountHolder()
    const rooms = createFirestoreCollection<Room>(
      {
        firestore: env.authenticatedContext(OWNER).firestore() as unknown as Firestore,
        account,
        clock: { now: () => new Date('2026-09-05T12:00:00Z') },
      },
      'rooms',
    )

    await expect(rooms.all()).rejects.toThrow(/No account is signed in/)
  })

  it('is refused for an account the rules do not name', async () => {
    const { rooms } = repository('somebody-else')
    await expect(rooms.save({ id: 'kitchen', name: 'Kitchen' })).rejects.toThrow()
  })
})
