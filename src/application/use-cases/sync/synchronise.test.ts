import { describe, expect, it } from 'vitest'

import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Exercise } from '@/domain/exercises/exercise'
import type { BacklogItemId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  BacklogItemRepository,
  ProjectRepository,
  CheckInRepository,
  Clock,
  ExerciseRepository,
  SyncState,
  SettingsRepository,
  SyncStateRepository,
  TombstoneRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { AppSettings } from '@/domain/settings/settings'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import type { Tombstone } from '@/domain/sync/tombstone'
import { aWorkout } from '@/test/builders/workout'
import {
  createMemorySyncServer,
  createMemorySyncTarget,
  createNullSyncTarget,
} from '@/infrastructure/sync/targets'

import { createItem, logDailyProgress } from '@/domain/backlog/item'

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
  readonly backlog: Map<string, Item>
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

  /*
   * A real double, unlike the exercises and check-ins above, because the
   * backlog is the one collection whose *contents* are reconciled — a
   * stub returning an empty list would let the progress-union test pass
   * against a `unionProgress` that was never called.
   */
  const backlog = new Map<string, Item>()
  const items: BacklogItemRepository = {
    all: () => Promise.resolve([...backlog.values()]),
    byId: (id) => Promise.resolve(backlog.get(id as string)),
    save: (record) => {
      backlog.set(record.id, { ...record, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (records) => {
      for (const record of records) backlog.set(record.id, record)
      return Promise.resolve()
    },
    purge: (id: BacklogItemId) => {
      backlog.delete(id)
      return Promise.resolve()
    },
    remove: (id: BacklogItemId) => {
      backlog.delete(id)
      graves.set(`items:${id as string}`, {
        id,
        collection: 'items',
        deletedAt: clock.now().toISOString(),
      })
      return Promise.resolve()
    },
    clear: () => {
      backlog.clear()
      return Promise.resolve()
    },
    count: () => Promise.resolve(backlog.size),
  }

  /*
   * A stub, unlike the backlog above. Nothing in these tests exercises
   * project records, and a double that pretended to would be testing
   * itself — the quest log's own exchange is covered where the graph
   * rules it depends on live.
   */
  const projects: ProjectRepository = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(0),
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

  /*
   * Settings the device actually holds, so the merge is exercised rather
   * than stubbed. A double that always answers with the defaults would
   * make every settings assertion pass against an implementation that
   * never wrote anything.
   */
  let stored: AppSettings = { ...DEFAULT_SETTINGS }
  const settings: SettingsRepository = {
    get: () => Promise.resolve(stored),
    save: (next) => {
      stored = next
      return Promise.resolve()
    },
  }

  return {
    exercises,
    workouts,
    checkIns,
    items,
    projects,
    tombstones,
    syncState,
    settings,
    clock,
    log,
    backlog,
  }
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

describe('syncing the settings the program is derived from', () => {
  it('carries a tier change to the other device', () => {
    /*
     * The gap this closes. Without it the two devices agree perfectly
     * about history and derive different programs from it — a session
     * logged on a Tuesday the other device does not show.
     */
    return (async () => {
      const clock = advancingClock()
      const server = createMemorySyncServer()
      const phone = device(clock)
      const desk = device(clock)

      const changed = await phone.settings.get()
      await phone.settings.save({
        ...changed,
        daysPerWeek: 3,
        updatedAt: clock.now().toISOString(),
      })

      await synchronise(createMemorySyncTarget(server, 'phone'), phone)
      const report = await synchronise(createMemorySyncTarget(server, 'desk'), desk)

      expect(report.received).toBe(1)
      expect((await desk.settings.get()).daysPerWeek).toBe(3)
    })()
  })

  it('does not send settings that have not changed', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const target = createMemorySyncTarget(server, 'phone')

    const changed = await phone.settings.get()
    await phone.settings.save({ ...changed, daysPerWeek: 3, updatedAt: clock.now().toISOString() })

    expect((await synchronise(target, phone)).pushed).toBe(1)

    // The watermark is the whole reason a second exchange is quiet. A
    // settings blob re-sent every time would keep two devices trading the
    // same values forever.
    expect((await synchronise(target, phone)).pushed).toBe(0)
  })

  it('leaves device preferences alone on the receiving side', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const deskLocal = await desk.settings.get()
    await desk.settings.save({ ...deskLocal, theme: 'dark', updatedAt: clock.now().toISOString() })

    const phoneLocal = await phone.settings.get()
    await phone.settings.save({
      ...phoneLocal,
      daysPerWeek: 3,
      theme: 'light',
      updatedAt: clock.now().toISOString(),
    })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    const after = await desk.settings.get()

    expect(after.daysPerWeek).toBe(3)
    // The phone's theme never left it, so the desktop keeps its own.
    expect(after.theme).toBe('dark')
  })
})

describe('settings bugs an eval agent found', () => {
  it('does not let a device preference push stale shared settings', async () => {
    /*
     * Push happens before pull, so a device whose settings blob is the
     * newest wins — and stamping every save made toggling dark mode the
     * newest. The other phone's genuine reminder change was then
     * overwritten by this phone's untouched copy of it. About as quiet as
     * a bug gets: a theme switch reverting someone else's edit.
     */
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const deskBase = await desk.settings.get()
    await desk.settings.save({
      ...deskBase,
      weeksBeforeDeload: 8,
      updatedAt: clock.now().toISOString(),
    })
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    // Only a device preference moves here, and it moves *later*.
    const phoneBase = await phone.settings.get()
    await phone.settings.save({ ...phoneBase, theme: 'dark' })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    const after = await phone.settings.get()
    expect(after.theme).toBe('dark')
    expect(after.weeksBeforeDeload).toBe(8)
  })

  it('stops re-sending settings on a device whose clock runs slow', async () => {
    /*
     * Accepted settings keep the *sending* device's stamp. On a slow
     * clock that value sits permanently ahead of the local watermark, so
     * comparing by ordering re-pushed the same blob on every exchange,
     * forever, with nothing having changed.
     */
    const fast = advancingClock()
    const slow = { now: () => new Date(fast.now().getTime() - 4 * 60 * 1000) }

    const server = createMemorySyncServer()
    const phone = device(fast)
    const desk = device(slow)

    const base = await phone.settings.get()
    await phone.settings.save({ ...base, daysPerWeek: 3, updatedAt: fast.now().toISOString() })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    const deskTarget = createMemorySyncTarget(server, 'desk')
    expect((await synchronise(deskTarget, desk)).received).toBe(1)

    // The slow device now holds a stamp from the future. It must still go
    // quiet rather than pushing it back every time.
    expect((await synchronise(deskTarget, desk)).pushed).toBe(0)
    expect((await synchronise(deskTarget, desk)).pushed).toBe(0)
  })
})

/*
 * The one collection whose contents are merged rather than replaced.
 *
 * Everything else in this app is whole-record last-write-wins, and that is
 * right for a workout: you log sets on the phone in the gym and read them
 * at the desk. A backlog is used differently — a chapter on the phone on
 * Monday, an episode on the laptop on Tuesday, neither device having heard
 * from the other — and under a record-level winner Monday disappears.
 */
describe('a backlog item’s progress log', () => {
  const anItem = (): Item =>
    createItem(
      { title: 'The Way of Kings', category: 'books', dailyGoal: { amount: 1, unit: 'chapter' } },
      {
        clock: { now: () => new Date('2026-08-01T09:00:00.000Z') },
        ids: { next: () => 'way-of-kings' },
      },
    )

  it('keeps both devices’ days when neither has heard from the other', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const shared = anItem()
    await phone.items.save(shared)
    await desk.items.save(shared)

    const monday = new Date(2026, 7, 24, 20, 0)
    const tuesday = new Date(2026, 7, 25, 20, 0)

    await phone.items.save(
      logDailyProgress(shared, { on: monday }, { clock, ids: { next: () => 'unused' } }),
    )
    await desk.items.save(
      logDailyProgress(shared, { on: tuesday }, { clock, ids: { next: () => 'unused' } }),
    )

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect((await desk.items.byId(shared.id))?.dailyProgress).toEqual([
      { date: '2026-08-24', amount: 1 },
      { date: '2026-08-25', amount: 1 },
    ])
  })

  it('takes the larger count when both devices logged the same day', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const shared = anItem()
    const deps = { clock, ids: { next: () => 'unused' } }
    const today = new Date(2026, 7, 24, 20, 0)

    const once = logDailyProgress(shared, { on: today }, deps)
    await phone.items.save(once)
    await desk.items.save(logDailyProgress(once, { on: today }, deps))

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    // Neither device can have lost progress it recorded, so the higher
    // number is the one that saw more. Two separate readings on one day
    // still show up as the larger of the two — better than the whole day
    // vanishing, and the reason this is documented rather than hidden.
    expect((await desk.items.byId(shared.id))?.dailyProgress).toEqual([
      { date: '2026-08-24', amount: 2 },
    ])
  })

  it('does not resurrect an item the other device deleted', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const shared = anItem()
    await phone.items.save(shared)
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    await phone.items.remove(shared.id)
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect(await desk.items.byId(shared.id)).toBeUndefined()
  })
})
