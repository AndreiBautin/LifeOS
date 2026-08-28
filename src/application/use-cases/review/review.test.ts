import { describe, expect, it } from 'vitest'

import { createItem } from '@/domain/backlog/item'
import type { CellId } from '@/domain/atlas/exploration/GeoCell'
import type { Place } from '@/domain/atlas/place/Place'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { SCORING } from '@/domain/game/registry'
import {
  asExerciseId,
  asFriendId,
  asMetricId,
  asProjectId,
  asUpgradeId,
  type MetricId,
} from '@/domain/ids/ids'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Clock, WorkoutRepository, ReviewRepository } from '@/domain/repositories/ports'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Friend } from '@/domain/social/circle'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import { aWorkout } from '@/test/builders/workout'

import { measureAll } from './measure'
import {
  draftReview,
  readout,
  retireMetric,
  saveMetric,
  saveReview,
  type ReviewDeps,
} from './review'

/**
 * The spine, end to end.
 *
 * The claim this suite exists to check is the phase's whole point: six
 * areas produce ratings from real data and **not one of them scores
 * itself**. Every rating comes from `domain/review/`, and every
 * measurement from one place that reads the hub's own stores.
 */
function harness(
  at = new Date(2026, 7, 26, 9, 0),
  // Deliberately not `Partial<AppSettings>`: a test needs to express "no
  // bodyweight on file", and under `exactOptionalPropertyTypes` a Partial
  // will not carry an explicit `undefined` through.
  settingsOverride: Record<string, unknown> = {},
  walkedCells: CellId[] = [],
) {
  const clock: Clock = { now: () => at }

  const backlog: Item[] = []
  const projectList: Project[] = []
  const upgradeList: Upgrade[] = []
  const friendList: Friend[] = []
  const workoutList: ReturnType<typeof aWorkout>[] = []

  const definedMetrics = new Map<string, MetricDefinition>()
  const snapshotStore = new Map<string, MonthlySnapshot>()

  const placeList: Place[] = []

  const stub = <T>(list: T[]) => ({
    all: () => Promise.resolve(list),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(list.length),
  })

  const review: ReviewRepository = {
    metrics: () => Promise.resolve([...definedMetrics.values()]),
    saveMetric: (metric) => {
      definedMetrics.set(metric.id, metric)
      return Promise.resolve()
    },
    removeMetric: (id) => {
      definedMetrics.delete(id)
      return Promise.resolve()
    },
    restoreMetrics: () => Promise.resolve(),
    snapshots: () => Promise.resolve([...snapshotStore.values()]),
    snapshot: (month) => Promise.resolve(snapshotStore.get(month)),
    saveSnapshot: (snapshot) => {
      snapshotStore.set(snapshot.month, snapshot)
      return Promise.resolve()
    },
    restoreSnapshots: () => Promise.resolve(),
    removeSnapshot: (month) => {
      snapshotStore.delete(month)
      return Promise.resolve()
    },
    purgeSnapshot: () => Promise.resolve(),
  }

  const deps: ReviewDeps = {
    items: stub(backlog),
    projects: stub(projectList),
    upgrades: stub(upgradeList),
    workouts: stub(workoutList) as unknown as WorkoutRepository,
    friends: stub(friendList),
    places: stub(placeList),
    dailies: stub([]),
    vices: stub([]),
    weighIns: stub([]),
    explored: {
      all: () => Promise.resolve(new Set(walkedCells)),
      reveal: () => Promise.resolve(0),
      clear: () => Promise.resolve(),
      count: () => Promise.resolve(walkedCells.length),
    },
    // No region by default, so the exploration ladder reads nothing —
    // which is what every test here that predates the map expects.
    settings: {
      get: () => Promise.resolve({ ...DEFAULT_SETTINGS, ...settingsOverride }),
      save: () => Promise.resolve(),
    },
    review,
    clock,
  }

  return {
    deps,
    backlog,
    projectList,
    upgradeList,
    friendList,
    workoutList,
    placeList,
    snapshotStore,
  }
}

const anItemDeps = {
  clock: { now: () => new Date(2026, 0, 1) },
  ids: { next: () => 'item' },
}

describe('measuring the hub', () => {
  /*
   * Absent, never zero. A month with no backlog is not a month whose
   * backlog aged nothing — and `seriesFor` skips absent readings precisely
   * so an evaluator is never handed a fabricated number.
   */
  it('reports nothing for an area with no data at all', async () => {
    const { deps } = harness()

    /*
     * Settings are data, and the shipped defaults carry a bodyweight and
     * estimated maxes read out of a real 5/3/1 export — so the strength
     * ladders have something true to say on a fresh install where every
     * store is still empty. Everything genuinely unmeasured stays absent,
     * which is what this is really asserting.
     */
    const measured = await measureAll(deps)

    expect(Object.keys(measured).sort()).toEqual([
      'training.bench-e1rm',
      'training.deadlift-e1rm',
      'training.squat-e1rm',
      'training.total',
    ])
  })

  /*
   * The standards are multiples of bodyweight, so the number placed on the
   * ladder is a ratio and not a load. Feeding pounds to a ladder whose
   * rungs are 0.75 and 1.25 puts everybody at Elite, which is the sort of
   * wrong that looks like good news.
   */
  it('measures strength as a multiple of bodyweight', async () => {
    const { deps } = harness()

    const measured = await measureAll(deps)

    // 303 lb squat at 200 lb bodyweight.
    expect(measured['training.squat-e1rm']).toBeCloseTo(1.515, 3)
  })

  it('says nothing about strength without a bodyweight to divide by', async () => {
    const { deps } = harness(undefined, { bodyweight: undefined })

    const measured = await measureAll(deps)

    expect(measured['training.squat-e1rm']).toBeUndefined()
    expect(measured['training.total']).toBeUndefined()
  })

  /*
   * A total missing one lift is not a smaller total, it is a wrong one —
   * and it reads as a lower level rather than as a gap, which is exactly
   * the failure this file is careful about everywhere else.
   */
  it('refuses a total when a lift is missing', async () => {
    const { deps } = harness(undefined, {
      estimatedMaxes: { [asExerciseId('low-bar-squat')]: 300 },
    })

    const measured = await measureAll(deps)

    expect(measured['training.squat-e1rm']).toBeDefined()
    expect(measured['training.total']).toBeUndefined()
  })

  it('counts the tech tree as a share of what is owned', async () => {
    const { deps, upgradeList } = harness()

    const base: Omit<Upgrade, 'id' | 'title' | 'status'> = {
      category: 'office',
      priority: 50,
      createdAt: '2026-01-01T00:00:00.000Z',
    }

    upgradeList.push(
      { ...base, id: asUpgradeId('a'), title: 'A', status: 'purchased' },
      { ...base, id: asUpgradeId('b'), title: 'B', status: 'idea' },
      { ...base, id: asUpgradeId('c'), title: 'C', status: 'idea' },
      // Cancelled is out of both halves: something decided against is not
      // progress and is not a debt.
      { ...base, id: asUpgradeId('d'), title: 'D', status: 'cancelled' },
    )

    expect((await measureAll(deps))['upgrades.owned-share']).toBe(33)
  })

  it('counts the active circle', async () => {
    const { deps, friendList } = harness()

    friendList.push(
      { id: asFriendId('a'), name: 'A', lastHangout: '2026-08-01', createdAt: '' },
      { id: asFriendId('b'), name: 'B', lastHangout: '2020-01-01', createdAt: '' },
    )

    expect((await measureAll(deps))['social.contacts-in-month']).toBe(1)
  })

  it('counts the actions closed this month, and not last month’s', async () => {
    const { deps, projectList } = harness()

    projectList.push({
      id: asProjectId('p'),
      name: 'P',
      impact: 5,
      urgency: 5,
      effort: 5,
      status: 'active',
      isBlocked: false,
      blockedBy: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      actions: [
        {
          id: 'a' as never,
          description: 'this month',
          status: 'done',
          order: 1,
          createdAt: '',
          completedAt: '2026-08-10T00:00:00.000Z',
        },
        {
          id: 'b' as never,
          description: 'last month',
          status: 'done',
          order: 2,
          createdAt: '',
          completedAt: '2026-07-10T00:00:00.000Z',
        },
        { id: 'c' as never, description: 'open', status: 'pending', order: 3, createdAt: '' },
      ],
    })

    expect((await measureAll(deps))['projects.actions-closed-in-month']).toBe(1)
  })

  it('uses the backlog’s own statistic rather than a second copy of it', async () => {
    const { deps, backlog } = harness()
    backlog.push(createItem({ title: 'Dune', category: 'books' }, anItemDeps))

    const measured = await measureAll(deps)

    expect(measured['backlog.median-age-days']).toBeGreaterThan(200)
  })
})

describe('the monthly review', () => {
  it('opens on measured values nobody has to type', async () => {
    const { deps, friendList } = harness()
    friendList.push({ id: asFriendId('a'), name: 'A', lastHangout: '2026-08-01', createdAt: '' })

    const draft = await draftReview(deps)

    expect(draft.month).toBe('2026-08')
    expect(draft.started).toBe(false)
    expect(draft.measured['social.contacts-in-month']).toBe(1)
  })

  /*
   * One review per month is the invariant the record turns on. Re-filing
   * corrects what is there rather than adding a second reading.
   */
  it('corrects the month already filed rather than adding another', async () => {
    const { deps, snapshotStore } = harness()

    await saveReview({ 'finance.net-worth': 1000 }, deps)
    await saveReview({ 'finance.net-worth': 1200 }, deps)

    expect(snapshotStore.size).toBe(1)
    expect(snapshotStore.get('2026-08')?.values['finance.net-worth']).toBe(1200)
  })

  it('keeps the original creation time when a month is corrected', async () => {
    const { deps, snapshotStore } = harness()

    await saveReview({ x: 1 }, deps)
    const first = snapshotStore.get('2026-08')?.createdAt
    await saveReview({ x: 2 }, deps)

    expect(snapshotStore.get('2026-08')?.createdAt).toBe(first)
  })

  /*
   * The screen showed the measured numbers; it does not get to decide
   * them. Re-read at save, and last in the merge, so nothing typed can
   * shadow something the app counted.
   */
  it('re-reads measured values at save rather than trusting the caller', async () => {
    const { deps, friendList, snapshotStore } = harness()
    friendList.push({ id: asFriendId('a'), name: 'A', lastHangout: '2026-08-01', createdAt: '' })

    await saveReview({ 'social.contact': 99 }, deps)

    expect(snapshotStore.get('2026-08')?.values['social.contact']).toBe(1)
  })

  /*
   * Measured values arrive keyed by *source* and must be stored keyed by
   * *metric*, because a metric is what reads them back. Getting this wrong
   * is silent and total: every measured area reads as never recorded while
   * the snapshot sits there full of numbers. It was, until the app was
   * driven and every area said "not enough data" with three months on
   * file.
   */
  it('stores a measured value under the metric that reads it, not the source', async () => {
    const { deps, friendList, snapshotStore } = harness()
    friendList.push({ id: asFriendId('a'), name: 'A', lastHangout: '2026-08-01', createdAt: '' })

    await saveReview({}, deps)

    const values = snapshotStore.get('2026-08')?.values ?? {}
    expect(values['social.contact']).toBe(1)
    expect(values['social.contacts-in-month']).toBeUndefined()
  })

  /*
   * The end-to-end claim, against a measured area rather than a
   * hand-defined one: two months of counting produce a judgement with
   * nobody having typed a number.
   */
  it('judges a measured area from two months of counting', async () => {
    const { deps, friendList, snapshotStore } = harness()
    friendList.push(
      { id: asFriendId('a'), name: 'A', lastHangout: '2026-08-01', createdAt: '' },
      { id: asFriendId('b'), name: 'B', lastHangout: '2026-08-02', createdAt: '' },
      { id: asFriendId('c'), name: 'C', lastHangout: '2026-08-03', createdAt: '' },
      { id: asFriendId('d'), name: 'D', lastHangout: '2026-08-04', createdAt: '' },
      { id: asFriendId('e'), name: 'E', lastHangout: '2026-08-05', createdAt: '' },
    )

    // Last month the circle was below the threshold of four.
    snapshotStore.set('2026-07', {
      month: '2026-07',
      values: { 'social.contact': 2 },
      createdAt: '',
    })
    await saveReview({}, deps)

    const social = (await readout(deps)).areas.find((area) => area.area === 'social')

    // Five active now, threshold four: crossed back over, so improved.
    expect(social?.metrics[0]?.latest).toBe(5)
    expect(social?.metrics[0]?.outcome).toBe('improved')
  })

  it('carries entered values forward into the next draft of the same month', async () => {
    const { deps } = harness()
    await saveMetric(
      {
        id: asMetricId('finance.net-worth'),
        area: 'finance',
        name: 'Net worth',
        unit: 'currency',
        direction: 'increase',
        cadence: 'monthly',
        sortOrder: 0,
        active: true,
      },
      deps,
    )
    await saveReview({ 'finance.net-worth': 1000 }, deps)

    const draft = await draftReview(deps)

    expect(draft.started).toBe(true)
    expect(draft.entered['finance.net-worth']).toBe(1000)
  })

  /*
   * A value stored for a metric that no longer exists has nothing to show
   * it in, so the draft leaves it out — and the stored reading stays put,
   * which is what makes retiring a metric safe.
   */
  it('leaves out a value whose metric is gone', async () => {
    const { deps } = harness()
    await saveReview({ 'finance.orphan': 1000 }, deps)

    expect((await draftReview(deps)).entered['finance.orphan']).toBeUndefined()
  })
})

describe('the readout', () => {
  const netWorth = (): MetricDefinition => ({
    id: asMetricId('finance.net-worth'),
    area: 'finance',
    name: 'Net worth',
    unit: 'currency',
    direction: 'increase',
    cadence: 'monthly',
    sortOrder: 0,
    active: true,
  })

  it('has nothing to say before two months exist', async () => {
    const { deps } = harness()
    await saveMetric(netWorth(), deps)
    await saveReview({ 'finance.net-worth': 1000 }, deps)

    const result = await readout(deps)
    const finance = result.areas.find((area) => area.area === 'finance')

    expect(finance?.metrics[0]?.outcome).toBe('insufficient-data')
    expect(finance?.score).toBeUndefined()
  })

  it('judges a metric once two months exist', async () => {
    const { deps, snapshotStore } = harness()
    await saveMetric(netWorth(), deps)

    snapshotStore.set('2026-07', {
      month: '2026-07',
      values: { 'finance.net-worth': 1000 },
      createdAt: '',
    })
    await saveReview({ 'finance.net-worth': 1200 }, deps)

    const finance = (await readout(deps)).areas.find((area) => area.area === 'finance')

    expect(finance?.metrics[0]?.outcome).toBe('improved')
    expect(finance?.score).toBe(100)
  })

  /*
   * The claim the whole phase turns on. Every area in the registry is
   * present in the readout, judged by the same evaluators, and no domain
   * contributed a line of scoring of its own.
   */
  it('covers every area the game model declares', async () => {
    const { deps } = harness()

    const areas = (await readout(deps)).areas.map((area) => area.area)
    const declared = SCORING.filter((area) => area.ratings.length > 0).map((area) => area.area)

    expect(areas.toSorted()).toEqual(declared.toSorted())
  })

  /*
   * Areas are blended, not metrics. Averaging metrics directly would let
   * an area with nine tracked numbers outvote one with a single important
   * one — a statement about how much you happen to measure rather than
   * about how things are going.
   */
  it('blends areas rather than metrics', async () => {
    const { deps, snapshotStore } = harness()

    await saveMetric(netWorth(), deps)
    await saveMetric({ ...netWorth(), id: asMetricId('finance.savings'), name: 'Savings' }, deps)
    await saveMetric(
      { ...netWorth(), id: asMetricId('health.vo2'), area: 'health', name: 'VO2' },
      deps,
    )

    snapshotStore.set('2026-07', {
      month: '2026-07',
      values: { 'finance.net-worth': 10, 'finance.savings': 10, 'health.vo2': 10 },
      createdAt: '',
    })
    await saveReview({ 'finance.net-worth': 20, 'finance.savings': 20, 'health.vo2': 5 }, deps)

    const result = await readout(deps)

    // Two improved finance metrics are one area at 100; one regressed
    // health metric is one area at 30. The blend is 65, not the 77 that
    // averaging three metrics directly would give.
    expect(result.score).toBe(65)
  })
})

describe('retiring a metric', () => {
  /*
   * Months of readings refer to it. Deleting the definition would leave
   * those values in the record with nothing to say what they measured.
   */
  it('drops it from the readout and leaves its history alone', async () => {
    const { deps, snapshotStore } = harness()
    const id = asMetricId('finance.net-worth')

    await saveMetric(
      {
        id,
        area: 'finance',
        name: 'Net worth',
        unit: 'currency',
        direction: 'increase',
        cadence: 'monthly',
        sortOrder: 0,
        active: true,
      },
      deps,
    )
    await saveReview({ [id]: 1000 }, deps)

    await retireMetric(id, deps)

    const result = await readout(deps)
    expect(result.areas.some((area) => area.area === 'finance')).toBe(false)
    expect(snapshotStore.get('2026-08')?.values[id]).toBe(1000)
  })
})

describe('saveMetric', () => {
  it('refuses an incomplete definition where somebody can still fix it', async () => {
    const { deps } = harness()

    const result = await saveMetric(
      {
        id: 'finance.credit' as MetricId,
        area: 'finance',
        name: 'Credit score',
        unit: 'points',
        direction: 'stay-above',
        cadence: 'monthly',
        sortOrder: 0,
        active: true,
      },
      deps,
    )

    expect(result.error).toMatch(/threshold/)
  })
})
