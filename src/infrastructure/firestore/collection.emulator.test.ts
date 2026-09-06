import { readFileSync } from 'node:fs'

import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase/firestore'

import { createAccountHolder } from './account-holder'
import { createFirestoreCollection } from './collection'
import type { TombstoneRepository } from '@/domain/repositories/ports'
import type { Tombstone } from '@/domain/sync/tombstone'

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

/** Somewhere for a deletion to be recorded, and something to read back. */
function tombstoneSink(): TombstoneRepository & { readonly recorded: Tombstone[] } {
  const recorded: Tombstone[] = []
  return {
    recorded,
    all: () => Promise.resolve(recorded),
    since: (at: string) => Promise.resolve(recorded.filter((one) => one.deletedAt > at)),
    record: (many: readonly Tombstone[]) => {
      recorded.push(...many)
      return Promise.resolve()
    },
  }
}

function repository(uid: string = OWNER) {
  const account = createAccountHolder()
  account.set(uid)
  const tombstones = tombstoneSink()

  return {
    account,
    tombstones,
    rooms: createFirestoreCollection<Room>(
      {
        firestore: env.authenticatedContext(uid).firestore() as unknown as Firestore,
        account,
        clock: { now: () => new Date('2026-09-05T12:00:00Z') },
        tombstones,
      },
      'rooms',
      undefined,
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
   * **Inverted rather than deleted**, because it is the record of a
   * belief that was wrong and may be argued for again.
   *
   * It used to assert that `remove` left no tombstone, on the reasoning
   * that one authoritative copy has nothing to tell "removed" from
   * "never seen". That is true of *sync* and false of *import*: a backup
   * file is a second copy of the database travelling through time, and
   * restoring one taken before a deletion brings the record back —
   * counted as an addition, because that is what it looks like. Firestore
   * being authoritative does not help, because the import writes into
   * Firestore.
   */
  it('records a deletion so a later import cannot undo it', async () => {
    const { rooms, tombstones } = repository()
    await rooms.save({ id: 'garage', name: 'Garage' })
    await rooms.remove('garage')

    expect(await rooms.byId('garage')).toBeUndefined()
    expect(await rooms.count()).toBe(0)
    expect(tombstones.recorded).toEqual([
      { id: 'garage', collection: 'rooms', deletedAt: '2026-09-05T12:00:00.000Z' },
    ])
  })

  /*
   * The other half, and the reason `buriedAs` is stated rather than
   * inferred from the collection's name: a collection that is not merged
   * has nothing to resurrect, and burying it would put rows in a store
   * nothing reads.
   */
  it('leaves no tombstone for a collection that is not merged', async () => {
    const account = createAccountHolder()
    account.set(OWNER)
    const tombstones = tombstoneSink()
    const notes = createFirestoreCollection<Room>(
      {
        firestore: env.authenticatedContext(OWNER).firestore() as unknown as Firestore,
        account,
        clock: { now: () => new Date('2026-09-05T12:00:00Z') },
        tombstones,
      },
      'rooms',
    )

    await notes.save({ id: 'shed', name: 'Shed' })
    await notes.remove('shed')

    expect(tombstones.recorded).toEqual([])
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
        tombstones: tombstoneSink(),
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
