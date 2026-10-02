import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { SCORING } from '@/domain/game/registry'
import { asExerciseId, asMetricId, type MetricId } from '@/domain/ids/ids'
import type { Clock, WorkoutRepository, ReviewRepository } from '@/domain/repositories/ports'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
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
) {
  const clock: Clock = { now: () => at }

  const workoutList: ReturnType<typeof aWorkout>[] = []

  const definedMetrics = new Map<string, MetricDefinition>()
  const snapshotStore = new Map<string, MonthlySnapshot>()

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
    workouts: stub(workoutList) as unknown as WorkoutRepository,
    settings: {
      get: () => Promise.resolve({ ...DEFAULT_SETTINGS, ...settingsOverride }),
      save: () => Promise.resolve(),
    },
    review,
    clock,
  }

  return { deps, workoutList, snapshotStore }
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
    /*
     * Both numbers are stated here rather than inherited from
     * `DEFAULT_SETTINGS`. This test is about the *ratio* — that a load is
     * divided by a bodyweight before it reaches a ladder — and reading the
     * squat off the shipped default made it fail the day that default
     * moved, which is a true fact about a constant it does not own and
     * says nothing about the arithmetic under test.
     */
    const { deps } = harness(undefined, {
      bodyweight: 200,
      estimatedMaxes: { [asExerciseId('low-bar-squat')]: 300 },
    })

    const measured = await measureAll(deps)

    expect(measured['training.squat-e1rm']).toBeCloseTo(1.5, 3)
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
})

/**
 * Thirteen finished sessions this month — a measured value for the spine
 * tests below, through `training.sessions-in-month`.
 */
function thirteenSessions(): ReturnType<typeof aWorkout>[] {
  return Array.from({ length: 13 }, (_, day) =>
    aWorkout({ date: `2026-08-${String(day + 1).padStart(2, '0')}` }),
  )
}

describe('the monthly review', () => {
  /*
   * **These four moved off social when that area was removed, rather
   * than being deleted with it.** They are about the *spine* — what a
   * draft opens on, what a save re-reads, which key a measured value is
   * stored under — and social was only ever the vehicle. Deleting a
   * rule's tests because the example went away is how a rule stops being
   * enforced without anybody deciding to stop enforcing it.
   *
   * The vehicle moved again when the tech tree went, to
   * `training.sessions-in-month` — measured the same way, and the one
   * measured rating a workout tracker has.
   */
  it('opens on measured values nobody has to type', async () => {
    const { deps, workoutList } = harness()
    workoutList.push(...thirteenSessions())

    const draft = await draftReview(deps)

    expect(draft.month).toBe('2026-08')
    expect(draft.started).toBe(false)
    expect(draft.measured['training.sessions-in-month']).toBe(13)
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
    const { deps, workoutList, snapshotStore } = harness()
    workoutList.push(...thirteenSessions())

    await saveReview({ 'training.consistency': 99 }, deps)

    expect(snapshotStore.get('2026-08')?.values['training.consistency']).toBe(13)
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
    const { deps, workoutList, snapshotStore } = harness()
    workoutList.push(...thirteenSessions())

    await saveReview({}, deps)

    const values = snapshotStore.get('2026-08')?.values ?? {}
    expect(values['training.consistency']).toBe(13)
    expect(values['training.sessions-in-month']).toBeUndefined()
  })

  /*
   * The end-to-end claim, against a measured area rather than a
   * hand-defined one: two months of counting produce a judgement with
   * nobody having typed a number.
   */
  it('judges a measured area from two months of counting', async () => {
    const { deps, workoutList, snapshotStore } = harness()
    workoutList.push(...thirteenSessions())

    // Ten sessions last month, under the twelve the rating asks for.
    snapshotStore.set('2026-07', {
      month: '2026-07',
      values: { 'training.consistency': 10 },
      createdAt: '',
    })
    await saveReview({}, deps)

    const training = (await readout(deps)).areas.find((area) => area.area === 'training')

    // 10 to 13 against a floor of 12: counted twice, judged once.
    expect(training?.metrics[0]?.latest).toBe(13)
    expect(training?.metrics[0]?.outcome).toBe('improved')
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

    /*
     * An area the registry does not declare, and that is the whole point
     * of the test: a *declared* rating keeps its area in the readout
     * whatever a stored metric does, so retiring one would prove
     * nothing.
     *
     * This said `finance.net-worth` until finance stopped being
     * imaginary — the id it borrowed to mean "made up" became a real
     * rating, and the assertion below quietly started testing the
     * opposite of what it says. Pick something the registry will not
     * absorb next.
     */
    const id = asMetricId('garden.tomatoes')

    await saveMetric(
      {
        id,
        area: 'garden',
        name: 'Tomatoes',
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
    expect(result.areas.some((area) => area.area === 'garden')).toBe(false)
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
