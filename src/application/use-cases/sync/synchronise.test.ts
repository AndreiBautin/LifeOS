import { asExerciseId } from '@/domain/ids/ids'
import { describe, expect, it } from 'vitest'

import type { Campaign } from '@/domain/campaign/campaign'
import type { ChallengeMark } from '@/domain/challenges/challenge'
import { readCharges, type Vice } from '@/domain/vitals/charges'
import type { FinanceReading } from '@/domain/finance/reading'
import { asViceId } from '@/domain/ids/ids'

import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Item } from '@/domain/backlog/item'
import type { Exercise } from '@/domain/exercises/exercise'
import type { BacklogItemId, WorkoutId } from '@/domain/ids/ids'
import type { CellId } from '@/domain/atlas/exploration/GeoCell'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  BacklogItemRepository,
  CheckInRepository,
  Clock,
  ExerciseRepository,
  ExploredAreaRepository,
  PlaceRepository,
  ProjectRepository,
  AttemptRepository,
  ChallengeRepository,
  RoomRepository,
  CampaignRepository,
  ResumeRepository,
  ReviewRepository,
  SettingsRepository,
  SyncState,
  SyncStateRepository,
  TombstoneRepository,
  ViceRepository,
  FinanceRepository,
  TripRepository,
  UpgradeRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { AppSettings } from '@/domain/settings/settings'
import type { Resume } from '@/domain/resume/resume'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import type { Tombstone } from '@/domain/sync/tombstone'
import { aWorkout } from '@/test/builders/workout'
import {
  createMemorySyncServer,
  createMemorySyncTarget,
  createNullSyncTarget,
} from '@/infrastructure/sync/targets'

import { createItem, logDailyProgress } from '@/domain/backlog/item'

import { mergeResume } from '@/domain/resume/resume'

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
  readonly walked: Set<CellId>
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
  const review: ReviewRepository = {
    metrics: () => Promise.resolve([]),
    saveMetric: () => Promise.resolve(),
    removeMetric: () => Promise.resolve(),
    restoreMetrics: () => Promise.resolve(),
    snapshots: () => Promise.resolve([]),
    snapshot: () => Promise.resolve(undefined),
    saveSnapshot: () => Promise.resolve(),
    restoreSnapshots: () => Promise.resolve(),
    removeSnapshot: () => Promise.resolve(),
    purgeSnapshot: () => Promise.resolve(),
  }

  const places: PlaceRepository = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    count: () => Promise.resolve(0),
  }

  const trips: TripRepository = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
  }

  /*
   * A real double, for the reason the backlog has one: a habit's
   * completions merge by union, and a stub that answers with an empty
   * list would let that pass against an implementation that replaced.
   */
  /*
   * A real double for the same reason as the dailies above: a pool's
   * spends merge by union, and a stub answering with an empty list would
   * let that pass against an implementation that replaced. It is the
   * sharper case of the two — `readCharges` counts entries, so a lost
   * merge silently hands back charges that were genuinely spent.
   */
  const viceStore = new Map<string, Vice>()
  const vices: ViceRepository = {
    all: () => Promise.resolve([...viceStore.values()]),
    byId: (id) => Promise.resolve(viceStore.get(id)),
    save: (vice) => {
      viceStore.set(vice.id, { ...vice, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (rows) => {
      for (const row of rows) viceStore.set(row.id, row)
      return Promise.resolve()
    },
    remove: (id) => {
      viceStore.delete(id)
      return Promise.resolve()
    },
    purge: (id) => {
      viceStore.delete(id)
      return Promise.resolve()
    },
  }

  /*
   * Both keyed by the day, and both plain last-write-wins — which is the
   * thing worth checking rather than stubbing past. Two devices with a
   * row for the same day hold two opinions about one fact, so the later
   * one is meant to win outright and nothing is meant to be unioned.
   */
  /*
   * A real double, like the finance one below it. Campaigns are
   * whole-record last-write-wins and the exchange has to be able to
   * carry one, which a stub returning an empty list could never show.
   */
  /*
   * A stub, unlike the campaigns below it. Nothing in these tests
   * exercises a practice log, and a double that pretended to would be
   * testing itself.
   */
  const rooms: RoomRepository = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
  }

  const attempts: AttemptRepository = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
  }

  const challengeStore = new Map<string, ChallengeMark>()
  const challenges: ChallengeRepository = {
    all: () => Promise.resolve([...challengeStore.values()]),
    save: (row) => {
      challengeStore.set(row.id, { ...row, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (rows) => {
      for (const row of rows) challengeStore.set(row.id, row)
      return Promise.resolve()
    },
    remove: (id) => {
      challengeStore.delete(id)
      return Promise.resolve()
    },
    purge: (id) => {
      challengeStore.delete(id)
      return Promise.resolve()
    },
  }

  const campaignStore = new Map<string, Campaign>()
  const campaigns: CampaignRepository = {
    all: () => Promise.resolve([...campaignStore.values()]),
    byId: (id) => Promise.resolve(campaignStore.get(id)),
    save: (row) => {
      campaignStore.set(row.id, { ...row, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (rows) => {
      for (const row of rows) campaignStore.set(row.id, row)
      return Promise.resolve()
    },
    remove: (id) => {
      campaignStore.delete(id)
      graves.set(`campaigns:${id}`, {
        id,
        collection: 'campaigns',
        deletedAt: clock.now().toISOString(),
      })
      return Promise.resolve()
    },
    purge: (id) => {
      campaignStore.delete(id)
      return Promise.resolve()
    },
  }

  const financeStore = new Map<string, FinanceReading>()
  const finance: FinanceRepository = {
    all: () => Promise.resolve([...financeStore.values()]),
    save: (row) => {
      financeStore.set(row.month, { ...row, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (rows) => {
      for (const row of rows) financeStore.set(row.month, row)
      return Promise.resolve()
    },
    remove: (month) => {
      financeStore.delete(month)
      return Promise.resolve()
    },
    purge: (month) => {
      financeStore.delete(month)
      return Promise.resolve()
    },
  }

  /*
   * A real double, like the backlog. The fog is the one thing in this
   * payload merged by union rather than by a record winner, and a stub
   * would let that test pass against an implementation that replaced.
   */
  const walked = new Set<CellId>()
  const explored: ExploredAreaRepository = {
    all: () => Promise.resolve(new Set(walked)),
    reveal: (cells) => {
      const before = walked.size
      for (const cell of cells) walked.add(cell)
      return Promise.resolve(walked.size - before)
    },
    clear: () => {
      walked.clear()
      return Promise.resolve()
    },
    count: () => Promise.resolve(walked.size),
  }

  const upgrades: UpgradeRepository = {
    all: () => Promise.resolve([]),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
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

  /*
   * The other singleton, and unlike the settings it starts *absent* —
   * which is the state every device is in until somebody types one.
   */
  let storedResume: Resume | undefined = undefined
  const resume: ResumeRepository = {
    get: () => Promise.resolve(storedResume),
    save: (next) => {
      storedResume = next
      return Promise.resolve()
    },
  }

  return {
    rooms,

    attempts,
    challenges,
    campaigns,
    resume,
    vices,
    finance,
    exercises,
    workouts,
    checkIns,
    items,
    projects,
    upgrades,
    review,
    places,
    trips,
    explored,
    walked,
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
        excludedExercises: [asExerciseId('dips')],
        updatedAt: clock.now().toISOString(),
      })

      await synchronise(createMemorySyncTarget(server, 'phone'), phone)
      const report = await synchronise(createMemorySyncTarget(server, 'desk'), desk)

      expect(report.received).toBe(1)
      expect((await desk.settings.get()).excludedExercises).toEqual([asExerciseId('dips')])
    })()
  })

  it('does not send settings that have not changed', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const target = createMemorySyncTarget(server, 'phone')

    const changed = await phone.settings.get()
    await phone.settings.save({
      ...changed,
      excludedExercises: [asExerciseId('dips')],
      updatedAt: clock.now().toISOString(),
    })

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
      excludedExercises: [asExerciseId('dips')],
      theme: 'light',
      updatedAt: clock.now().toISOString(),
    })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    const after = await desk.settings.get()

    expect(after.excludedExercises).toEqual([asExerciseId('dips')])
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
      excludedExercises: [asExerciseId('dips')],
      updatedAt: clock.now().toISOString(),
    })
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    // Only a device preference moves here, and it moves *later*.
    const phoneBase = await phone.settings.get()
    await phone.settings.save({ ...phoneBase, theme: 'dark' })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    const after = await phone.settings.get()
    expect(after.theme).toBe('dark')
    expect(after.excludedExercises).toEqual([asExerciseId('dips')])
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
    await phone.settings.save({
      ...base,
      excludedExercises: [asExerciseId('dips')],
      updatedAt: fast.now().toISOString(),
    })

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

  /*
   * The same union as a habit's completions, and the consequence of
   * getting it wrong is sharper here.
   *
   * `readCharges` counts *entries* in `spent`, so a record-level winner
   * would not merely lose a row — it would hand back a charge that was
   * genuinely spent, and the pool would read as fuller than it is on the
   * device that synced second.
   */
  it('keeps both devices’ spends on the same pool', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    const pool: Vice = {
      id: asViceId('coffee'),
      name: 'Coffee',
      capacity: 3,
      regenHours: 12,
      spent: [],
      createdAt: '2026-08-01T00:00:00.000Z',
    }

    await phone.vices.save({ ...pool, spent: ['2026-08-27T07:00:00.000Z'] })
    await desk.vices.save({ ...pool, spent: ['2026-08-27T09:00:00.000Z'] })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    const merged = await desk.vices.byId(pool.id)

    expect(merged?.spent).toEqual(['2026-08-27T07:00:00.000Z', '2026-08-27T09:00:00.000Z'])
    expect(merged).toBeDefined()
    if (merged === undefined) return
    // Two spends against a capacity of three, on both devices.
    expect(readCharges(merged, new Date('2026-08-27T10:00:00.000Z')).available).toBe(1)
  })

  /*
   * The other half, and the reason a date-keyed record is *not* unioned.
   * Two devices holding a figure for the same month are two opinions
   * about one fact, so the later one wins outright — unioning would
   * leave both and quietly average a correction with the thing it was
   * correcting.
   *
   * Written against weigh-ins, which have gone. The rule did not: a
   * finance row is keyed by its month on exactly the same reasoning, so
   * this moved rather than being deleted along with the record that
   * happened to be its first example.
   */
  it('lets the later figure for a month replace the earlier one', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    await phone.finance.save({ month: '2026-08', netWorthMinor: 100_000 })
    await desk.finance.save({ month: '2026-08', netWorthMinor: 142_500 })

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    const rows = await phone.finance.all()

    expect(rows).toHaveLength(1)
    expect(rows[0]?.netWorthMinor).toBe(142_500)
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

/*
 * The fog, which is the one thing here that is neither a record nor a
 * blob.
 *
 * As a single blob under one stamp — which is how it arrived — a
 * record-level winner erases whichever device walked less recently. There
 * is no version of that which works: both copies are true, and the newer
 * one is not the fuller one. So it is a grow-only set, merged by union,
 * exempt from the tombstone filter, and these are the tests that say so.
 */
describe('ground you have walked', () => {
  const cells = (...ids: string[]) => ids as CellId[]

  it('accumulates on both devices rather than one erasing the other', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    // A morning walk on the phone, an afternoon one at the desk, neither
    // having heard from the other.
    await phone.explored.reveal(cells('gcpuvpk', 'gcpuvps'))
    await desk.explored.reveal(cells('gcpuvpu', 'gcpuvpv'))

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    const onDesk = [...(await desk.explored.all())].sort()
    const onPhone = [...(await phone.explored.all())].sort()

    expect(onDesk).toEqual(['gcpuvpk', 'gcpuvps', 'gcpuvpu', 'gcpuvpv'])
    expect(onPhone).toEqual(onDesk)
  })

  /*
   * The failure the union exists to prevent, stated as a test: the desk
   * walked *later*, and under a record-level winner its copy — which never
   * contained the phone's morning — would be the one that survived.
   */
  it('does not let the later device’s copy erase the earlier one’s ground', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    await phone.explored.reveal(cells('gcpuvpk'))
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    await desk.explored.reveal(cells('gcpuvpu'))
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect([...(await desk.explored.all())].sort()).toEqual(['gcpuvpk', 'gcpuvpu'])
  })

  it('is idempotent — walking the same ground twice changes nothing', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    await phone.explored.reveal(cells('gcpuvpk'))
    await desk.explored.reveal(cells('gcpuvpk'))

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect(await desk.explored.count()).toBe(1)
  })
})

/*
 * The resume shipped in no list at all — not the sync payload, not
 * `isEmpty`, not the backup envelope — so it existed on exactly one
 * device while both reported success. It is also the most expensive
 * record in the app to reproduce: everything else is a by-product of
 * using the app, and this one was typed in off a PDF.
 */
describe('syncing the resume', () => {
  const aResume = (name: string, at: string): Resume => ({
    name,
    contact: '',
    summary: '',
    skills: [],
    companies: [],
    education: [],
    updatedAt: at,
  })

  it('carries a resume to a device that has none', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    await phone.resume.save(aResume('Typed once', clock.now().toISOString()))

    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    const report = await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect((await desk.resume.get())?.name).toBe('Typed once')
    expect(report.received).toBe(1)
  })

  it('does not send a resume that has not changed', async () => {
    /*
     * Without the watermark the two devices trade the same document on
     * every exchange, forever, with nothing changing — the failure
     * `settingsSynced` already exists to prevent.
     */
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)

    await phone.resume.save(aResume('Typed once', clock.now().toISOString()))
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    const second = await synchronise(createMemorySyncTarget(server, 'phone'), phone)

    expect(second.pushed).toBe(0)
  })

  it('keeps the later edit when both devices have one', async () => {
    const clock = advancingClock()
    const server = createMemorySyncServer()
    const phone = device(clock)
    const desk = device(clock)

    await desk.resume.save(aResume('Older', clock.now().toISOString()))
    await phone.resume.save(aResume('Newer', clock.now().toISOString()))

    await synchronise(createMemorySyncTarget(server, 'desk'), desk)
    await synchronise(createMemorySyncTarget(server, 'phone'), phone)
    await synchronise(createMemorySyncTarget(server, 'desk'), desk)

    expect((await desk.resume.get())?.name).toBe('Newer')
    // A correction, not a merge: there are no per-day entries to union,
    // so the losing copy is gone. Same rule as a weigh-in.
    expect((await phone.resume.get())?.name).toBe('Newer')
  })

  it('never lets an unstamped resume overwrite a stamped one', () => {
    /*
     * The rule tombstones already follow: a copy that cannot prove it is
     * newer must not win. Reached directly rather than through an
     * exchange, because a device has no way to push an unstamped record.
     */
    const local = aResume('Stamped', '2026-08-25T09:00:01.000Z')

    // Built by removing the key rather than setting it to undefined:
    // under `exactOptionalPropertyTypes` those are different states, and
    // an absent stamp is the one that reaches a merge.
    const { updatedAt: _none, ...incoming } = aResume('Unstamped', '')

    expect(mergeResume(local, incoming)).toBe(local)
  })
})
