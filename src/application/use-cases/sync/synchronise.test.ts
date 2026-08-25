import { describe, expect, it } from 'vitest'

import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  CheckInRepository,
  Clock,
  ExerciseRepository,
  SyncState,
  SyncStateRepository,
  TombstoneRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { Tombstone } from '@/domain/sync/tombstone'
import { aWorkout } from '@/test/builders/workout'
import {
  createMemorySyncServer,
  createMemorySyncTarget,
  createNullSyncTarget,
} from '@/infrastructure/sync/targets'

import { synchronise, type SynchroniseDeps } from './synchronise'

/**
 * Two devices and one server, which is the entire scenario this exists
 * for: sets logged on a phone in a gym, read at a desk afterwards.
 *
 * Against in-memory doubles rather than two databases. `synchronise`
 * decides what to send and what to accept and touches no storage detail,
 * and the IndexedDB half — stamping `updatedAt` on save, writing a
 * tombstone on remove — is covered where it lives. Standing up two real
 * databases here would test `idb` twice and this function once.
 *
 * The doubles do stamp and bury, because those are the behaviours the
 * exchange depends on. A double that skipped them would let every test
 * pass against an implementation that never worked.
 */

function advancingClock(): Clock {
  // Distinct, ordered timestamps. A fixed clock gives every record the
  // same `updatedAt` and makes every watermark comparison vacuous.
  let tick = 0
  return {
    now: () => {
      tick += 1000
      return new Date(Date.UTC(2026, 7, 25, 9, 0, 0) + tick)
    },
  }
}

interface Device extends SynchroniseDeps {
  readonly log: Map<string, WorkoutLog>
}

function device(clock: Clock): Device {
  const log = new Map<string, WorkoutLog>()
  const graves = new Map<string, Tombstone>()
  let state: SyncState | undefined

  const workouts: WorkoutRepository = {
    byId: (id) => Promise.resolve(log.get(id as string)),
    all: () => Promise.resolve([...log.values()]),
    save: (record) => {
      log.set(record.id, { ...record, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (records) => {
      for (const record of records) log.set(record.id, record)
      return Promise.resolve()
    },
    purge: (id: WorkoutId) => {
      log.delete(id)
      return Promise.resolve()
    },
    remove: (id: WorkoutId) => {
      log.delete(id)
      graves.set(`workouts:${id as string}`, {
        id: id,
        collection: 'workouts',
        deletedAt: clock.now().toISOString(),
      })
      return Promise.resolve()
    },
    recent: () => Promise.resolve([]),
    inRange: () => Promise.resolve([]),
    onDate: () => Promise.resolve([]),
    forExercise: () => Promise.resolve([]),
    inProgress: () => Promise.resolve(undefined),
    count: () => Promise.resolve(log.size),
  }

  const exercises: ExerciseRepository = {
    all: () => Promise.resolve([] as readonly Exercise[]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    count: () => Promise.resolve(0),
  }

  const checkIns: CheckInRepository = {
    all: () => Promise.resolve([] as readonly CheckIn[]),
    byId: () => Promise.resolve(undefined),
    forWorkout: () => Promise.resolve([]),
    recent: () => Promise.resolve([]),
    save: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
  }

  const tombstones: TombstoneRepository = {
    all: () => Promise.resolve([...graves.values()]),
    since: (deletedAt) =>
      Promise.resolve([...graves.values()].filter((one) => one.deletedAt > deletedAt)),
    record: (incoming) => {
      for (const one of incoming) graves.set(`${one.collection}:${one.id}`, one)
      return Promise.resolve()
    },
  }

  const syncState: SyncStateRepository = {
    get: () => Promise.resolve(state),
    save: (next) => {
      state = next
      return Promise.resolve()
    },
  }

  return { exercises, workouts, checkIns, tombstones, syncState, clock, log }
}

describe('syncing two devices', () => {
  it('carries a session logged on one device to the other', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const session = aWorkout({ title: 'Tuesday', date: '2026-08-25' })
    await phone.workouts.save(session)

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    const report = await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect(report.received).toBe(1)
    expect((await desk.workouts.byId(session.id))?.title).toBe('Tuesday')
  })

  it('does not hand a device back its own writes', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const target = createMemorySyncTarget(server, 'phone')

    await phone.workouts.save(aWorkout())

    const first = await synchronise(target, phone)

    expect(first.pushed).toBe(1)
    // Pushed then pulled in one exchange. Receiving it back would write
    // identical records over themselves and report work that never moved.
    expect(first.received).toBe(0)
  })

  it('sends only what changed since the last exchange', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const target = createMemorySyncTarget(server, 'phone')

    await phone.workouts.save(aWorkout({ date: '2026-08-24' }))
    expect((await synchronise(target, phone)).pushed).toBe(1)

    // An exchange that sends nothing rather than everything again is the
    // whole reason a watermark is kept.
    expect((await synchronise(target, phone)).pushed).toBe(0)

    await phone.workouts.save(aWorkout({ date: '2026-08-26' }))
    expect((await synchronise(target, phone)).pushed).toBe(1)
  })

  it('propagates a deletion instead of letting the other device restore it', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const phoneTarget = createMemorySyncTarget(server, 'phone')
    const deskTarget = createMemorySyncTarget(server, 'desk')

    const session = aWorkout({ title: 'Mis-tapped finish' })
    await phone.workouts.save(session)
    await synchronise(phoneTarget, phone)
    await synchronise(deskTarget, desk)

    expect(await desk.workouts.byId(session.id)).toBeDefined()

    // Deleted on the phone. The desktop still holds a copy, and without a
    // tombstone its next push presents that copy as news.
    await phone.workouts.remove(session.id)
    await synchronise(phoneTarget, phone)
    await synchronise(deskTarget, desk)

    expect(await desk.workouts.byId(session.id)).toBeUndefined()

    // Still gone after another round trip in both directions, which is
    // where a naive implementation resurrects it.
    await synchronise(deskTarget, desk)
    await synchronise(phoneTarget, phone)

    expect(await desk.workouts.byId(session.id)).toBeUndefined()
    expect(await phone.workouts.byId(session.id)).toBeUndefined()
  })

  it('keeps an edit that came after the other device deleted the record', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const phoneTarget = createMemorySyncTarget(server, 'phone')
    const deskTarget = createMemorySyncTarget(server, 'desk')

    const session = aWorkout({ title: 'Tuesday' })
    await phone.workouts.save(session)
    await synchronise(phoneTarget, phone)
    await synchronise(deskTarget, desk)

    await phone.workouts.remove(session.id)
    // Edited on the desktop after the deletion, before the two spoke. A
    // deletion describes the record as it stood, not every later version.
    await desk.workouts.save({ ...session, title: 'Tuesday, corrected' })

    await synchronise(deskTarget, desk)
    await synchronise(phoneTarget, phone)

    expect((await phone.workouts.byId(session.id))?.title).toBe('Tuesday, corrected')
  })

  it('reports records it refused rather than silently dropping them', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const session = aWorkout()
    await desk.workouts.save(session)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    // The phone deleted this id, and the deletion is later than the copy
    // the desktop is offering.
    await phone.workouts.save(session)
    await phone.workouts.remove(session.id)

    const report = await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    expect(report.received).toBe(0)
    expect(report.rejected).toBe(1)
  })

  it('changes nothing when the target is the null one', async () => {
    const clock = advancingClock()
    const phone = device(clock)

    const session = aWorkout()
    await phone.workouts.save(session)

    const report = await synchronise(createNullSyncTarget(), phone)

    expect(report.received).toBe(0)
    expect(await phone.workouts.byId(session.id)).toBeDefined()
  })
})
