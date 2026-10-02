import { describe, expect, it } from 'vitest'

import { ALL_ACTS, SCORING } from '@/domain/game/registry'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { Clock, ReviewRepository } from '@/domain/repositories/ports'
import { DEFAULT_SETTINGS, type AppSettings } from '@/domain/settings/settings'

import { anEntry, aSet, aWorkout } from '@/test/builders/workout'

import { characterSheet, tallyActs, type SheetDeps } from './sheet'

/**
 * The character sheet is a join, not a calculation — the registry declares
 * what each area has and this turns declarations into a readout. So what
 * is worth testing is not the arithmetic but the joins: that an area with
 * nothing to say says nothing, that a ladder with no measurement does not
 * show a plausible zero, and that XP counts each act once.
 */
function harness(
  seed: {
    readonly workouts?: WorkoutLog[]
    readonly settings?: Partial<AppSettings>
  } = {},
) {
  const clock: Clock = { now: () => new Date(2026, 7, 26, 9, 0) }

  const list = <T>(rows: readonly T[]) => ({
    all: () => Promise.resolve(rows),
    recent: () => Promise.resolve(rows),
    byId: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveMany: () => Promise.resolve(),
    restoreMany: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    purge: () => Promise.resolve(),
    clear: () => Promise.resolve(),
    count: () => Promise.resolve(rows.length),
  })

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

  return {
    workouts: list(seed.workouts ?? []),
    settings: {
      get: () => Promise.resolve({ ...DEFAULT_SETTINGS, ...seed.settings }),
      save: () => Promise.resolve(),
    },
    review,
    clock,
  } as unknown as SheetDeps
}

/** A finished session holding one entry of the given role, its set done or not. */
function aSessionWith(role: 'warmup' | 'conditioning', done: boolean): WorkoutLog {
  return aWorkout({
    entries: [anEntry({ role, sets: [aSet({ outcome: done ? 'completed' : 'pending' })] })],
  })
}

describe('what an area says when it has nothing to say', () => {
  /*
   * The rule the whole sheet turns on. An area with no measurement, no
   * recorded rating and no acts is *silent* — it does not report level
   * zero, a score of nought, or "regressed". A fabricated reading is worse
   * than an obvious gap, and on a page whose entire job is to tell you how
   * things are going, a plausible zero is a lie with a progress bar.
   */
  it('reports every untouched area as silent', async () => {
    const sheet = await characterSheet(harness())

    /*
     * Training is the exception, and legitimately so: the shipped defaults
     * carry estimated maxes and a bodyweight read out of a real 5/3/1
     * export, so the strength ladders have something to read on a fresh
     * install. That is a measurement, not a fabrication.
     */
    const quiet = sheet.areas.filter((area) => area.area !== 'training')

    expect(quiet.every((area) => area.silent)).toBe(true)
    expect(sheet.areas.find((area) => area.area === 'training')?.silent).toBe(false)
  })

  it('stops being silent as soon as one act has happened', async () => {
    const sheet = await characterSheet(harness({ workouts: [aSessionWith('warmup', true)] }))
    const mobility = sheet.areas.find((area) => area.area === 'mobility')

    expect(mobility?.silent).toBe(false)
    expect(mobility?.xp).toBe(20)
  })
})

describe('the areas on the sheet', () => {
  /*
   * The join is the point: an area earns a place here by being declared in
   * the registry, not by this file knowing about it. If these ever drift,
   * an absorbed area silently stops appearing.
   */
  it('are exactly the areas the registry declares', async () => {
    const sheet = await characterSheet(harness())

    expect(sheet.areas.map((area) => area.area)).toEqual(SCORING.map((area) => area.area))
  })
})

describe('counting acts', () => {
  /*
   * Mobility and Stamina both ask whether the work was *done*, not
   * whether it was scheduled: every session of the programme carries a
   * warm-up and most carry conditioning, so counting the rows would pay
   * both bars on every lifting day whatever happened.
   */
  it('pays the warm-up only when a warm-up set was done', async () => {
    const tally = await tallyActs(
      harness({ workouts: [aSessionWith('warmup', true), aSessionWith('warmup', false)] }),
    )

    expect(tally['mobility.warm-up-done']).toBe(1)
    expect(tally['training.session-finished']).toBe(2)
  })

  it('pays conditioning only when a conditioning set was done', async () => {
    const tally = await tallyActs(
      harness({
        workouts: [aSessionWith('conditioning', true), aSessionWith('conditioning', false)],
      }),
    )

    expect(tally['cardio.session-logged']).toBe(1)
  })

  /* Six warm-up rows are one act, or the cheapest work would pay most. */
  it('pays the warm-up once a session, however many rows it has', async () => {
    const session = aWorkout({
      entries: [1, 2, 3].map((order) =>
        anEntry({ role: 'warmup', order, sets: [aSet({ outcome: 'completed' })] }),
      ),
    })

    expect((await tallyActs(harness({ workouts: [session] })))['mobility.warm-up-done']).toBe(1)
  })

  /*
   * Every act the registry declares should either be counted or knowingly
   * absent — this catches a new area arriving with an act nobody wired up,
   * which would otherwise show as a permanent zero nobody questions.
   */
  it('has a counted or deliberately absent entry for every declared act', async () => {
    const tally = await tallyActs(harness())
    const uncounted = ALL_ACTS.filter((act) => tally[act.id] === undefined).map((act) => act.id)

    /*
     * **Empty, and it got stronger when social went.** This used to
     * permit `social.hangout-logged`, the one act the registry declared
     * that `tallyActs` could not count — a friend kept a single ratcheted
     * `lastHangout` rather than a list of them. That area is gone, so
     * every act the registry declares is now actually wired, and the
     * exception this test carried can go with it.
     */
    expect(uncounted).toEqual([])
  })
})
