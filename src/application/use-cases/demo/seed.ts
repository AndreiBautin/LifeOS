import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { LogEntry, WorkoutLog } from '@/domain/logging/workout-log'
import type { Clock } from '@/domain/repositories/ports'

import type { DemoDeps } from './deps'

/**
 * The data the deployed app shows a first-time visitor.
 *
 * Three things make this safe to publish, and they are structural rather
 * than careful:
 *
 * 1. **Generated, never captured.** Every record below is written here,
 *    in a file anybody can read. There is no export step from a personal
 *    device anywhere in the pipeline, so there is no path by which real
 *    data could arrive.
 * 2. **A separate namespace.** A demo build sets `VITE_DEMO_MODE`, which
 *    moves the IndexedDB name and every storage key to a `lifeos.demo`
 *    prefix. The demo and any personal data on the same browser cannot
 *    collide.
 * 3. **Seeded only into empty storage.** `seedDemoData` refuses when
 *    anything is already there. That is a tested property rather than a
 *    convention — see `seed.test.ts`.
 *
 * **It drives the app's own use cases rather than writing records.**
 * Hand-built fixtures drift from the types they imitate and can encode
 * states the app cannot actually produce; going through `addProject` and
 * the rest means a fixture that compiles is a fixture the app could have
 * created, and every invariant those functions enforce holds here too.
 *
 * **Every date is an offset from the seed moment.** A fixture pinned to
 * absolute dates rots: opened a year later it shows dead streaks and an
 * empty "this month". Offsets keep it alive while staying deterministic
 * for a given clock.
 */

export interface SeedResult {
  readonly seeded: boolean
  /** Why not, when it declined. */
  readonly reason?: 'already-has-data'
}

/**
 * Days before the seed moment, as a **local** day key.
 *
 * Deliberately not `daysAgo(...).slice(0, 10)`, which is the UTC date —
 * west of Greenwich the two disagree for the last hours of every evening,
 * and a workout filed under tomorrow's key is a workout the history
 * screen shows on the wrong day. There is a lint rule about this.
 */
function dayKeyAgo(clock: Clock, days: number): string {
  const day = new Date(clock.now().getTime() - days * 86_400_000)
  const month = String(day.getMonth() + 1).padStart(2, '0')
  const date = String(day.getDate()).padStart(2, '0')
  return `${String(day.getFullYear())}-${month}-${date}`
}

/** Days before the seed moment, as an ISO timestamp. */
function daysAgo(clock: Clock, days: number): string {
  return new Date(clock.now().getTime() - days * 86_400_000).toISOString()
}

/**
 * Fills empty storage with a demonstration dataset.
 *
 * **Named for filling rather than for resetting**, and there is
 * deliberately no flag to make it overwrite. A call site must not be
 * able to ask for "fill if empty" and receive "wipe and replace" — the
 * rule this codebase already holds for destructive operations
 * everywhere else.
 */
export async function seedDemoData(deps: DemoDeps): Promise<SeedResult> {
  if ((await deps.workouts.count()) > 0) return { seeded: false, reason: 'already-has-data' }

  await seedSettings(deps)
  await seedTraining(deps)

  return { seeded: true }
}

/** Two shelves, a prerequisite chain, and something already owned. */
/**
 * The one setting the demo states, and it is a denominator.
 *
 * **A ladder is only a ladder because something outside the app fixes
 * its scale**, and for exploration that is the area of the region being
 * explored — which nothing here can know. Left unset the reading is
 * *absent*, which is the honest answer and demonstrates nothing, so the
 * fixture names a region the way a person would: the city its places are
 * in, at roughly its real area.
 *
 * **Merged rather than replaced.** Everything else in settings is a
 * default the app chose, and overwriting the blob to set one field would
 * make the demo silently responsible for every other one.
 */
async function seedSettings(deps: DemoDeps): Promise<void> {
  const current = await deps.settings.get()
  await deps.settings.save({ ...current, sampleData: 'loaded' })
}

/**
 * Four months of sessions, so the history, the trend and the training
 * grid all have something to show.
 *
 * **This is the one part written as records rather than driven through
 * the use cases**, and it is worth saying why, because the rest of this
 * file argues the opposite. `startWorkout` opens *today's* programme day
 * and `finishWorkout` advances the position from wherever it now stands,
 * so a loop of start-then-finish yields three sessions all dated today
 * with the block three days further on than the history claims. There is
 * no way to ask those use cases for a session that happened last week,
 * because from the app's point of view there never is one.
 *
 * What that gives up is the guarantee that the fixture can only hold
 * states the app could produce. It is bought back with the real exercise
 * slugs, the real `SetPrescription` shape and the real roles.
 */
async function seedTraining(deps: DemoDeps): Promise<void> {
  const lifted = (
    slug: string,
    order: number,
    role: LogEntry['role'],
    load: number,
    reps: number,
    /*
     * **Defaults to three and is overridable, which is what stops every
     * session totalling the same number.** It shipped fixed at three
     * with no parameter at all, so three `lifted()` calls plus one
     * `walked()` summed to exactly ten *every single time* — reported
     * as "the training data is all 10" against `RecentTraining`'s bar
     * chart, which was reading the fixture correctly and reporting a
     * fact about it that made the chart look broken. A heavier day
     * with a fourth back-off set, or a session with one more accessory,
     * is the realistic reason totals actually differ session to
     * session.
     */
    setCount = 4,
  ): LogEntry => ({
    exerciseId: slug as ExerciseId,
    role,
    order,
    sets: Array.from({ length: setCount }, () => ({
      prescription: {
        load: { kind: 'working' as const },
        reps: { kind: 'range' as const, low: reps - 2, high: reps + 2 },
      },
      plannedLoad: load,
      plannedReps: reps,
      actualLoad: load,
      actualReps: reps,
      outcome: 'completed' as const,
      isWarmup: false,
    })),
  })

  /*
   * Warm-up rows are logged as *completed*: a fixture of slots with
   * nothing done against them would read as a history of sessions walked
   * away from halfway.
   */
  const warmed = (): LogEntry => ({
    exerciseId: 'foam-roll' as ExerciseId,
    role: 'warmup',
    order: 0,
    sets: [
      {
        prescription: {
          load: { kind: 'open' as const },
          reps: { kind: 'fixed' as const, reps: 10 },
        },
        plannedReps: 10,
        actualReps: 10,
        outcome: 'completed' as const,
        isWarmup: true,
      },
    ],
  })

  /*
   * **Seventeen weeks of upper, legs, push, pull, legs, Monday to Friday —
   * the shipped routine, generated rather than listed.** Six hand-written
   * sessions made every history screen look like the app was installed
   * last week; what a reviewer should see is somebody four months in,
   * with the loads climbing the way double progression climbs them.
   *
   * Deterministic, so the fixture is the same on every seed: each load
   * rises linearly from where it started to where it is now, and roughly
   * one session in thirteen is skipped, because a history with no missed
   * day is not a history anybody believes.
   *
   * **Each competition lift ends where the Standards card says it is.**
   * Five reps near the final load estimate the sample's own maxes — about
   * 300 for 353, 205 for 238, 315 for 368 — so the strength chart's last
   * point and the standard beside it agree. The `to` figures sit a step
   * past those because each lift is trained once a week, so its latest
   * session is a few days short of the end of the ramp. They disagreed by
   * seventy pounds on the squat the first time this was generated.
   */
  const WEEKS = 17
  const round5 = (value: number): number => Math.round(value / 5) * 5
  /** Where a load sits between its first and latest session. */
  const along = (from: number, to: number, through: number): number =>
    round5(from + (to - from) * through)

  type Day = 'Upper' | 'Legs A' | 'Push' | 'Pull' | 'Legs B'
  /* `getDay()` is Sunday-first; the weekend is off. */
  const DAYS: Readonly<Record<number, Day>> = {
    1: 'Upper',
    2: 'Legs A',
    3: 'Push',
    4: 'Pull',
    5: 'Legs B',
  }

  /* The calf raise is two versions of one exercise, told apart by variant. */
  const version = (entry: LogEntry, variant: string): LogEntry => ({ ...entry, variant })

  const session = (day: Day, through: number, heavy: boolean): LogEntry[] => {
    const bump = Math.round(through * 3)
    const strengthSets = heavy ? 4 : 3
    switch (day) {
      case 'Upper':
        return [
          lifted('bench-press', 0, 'strength', along(170, 210, through), 5, strengthSets),
          lifted('pendlay-row', 1, 'hypertrophy', along(135, 165, through), 8),
          lifted('db-lateral-raise', 2, 'assistance', along(15, 20, through), 18),
          lifted('barbell-shrug', 3, 'assistance', along(185, 225, through), 18),
        ]
      case 'Legs A':
        return [
          lifted('low-bar-squat', 0, 'strength', along(255, 305, through), 5, strengthSets),
          lifted('romanian-deadlift', 1, 'hypertrophy', along(135, 185, through), 8),
          version(
            lifted('barbell-calf-raise', 2, 'assistance', along(170, 210, through), 15),
            'Heavy',
          ),
          lifted('ab-wheel', 3, 'assistance', 0, 10 + bump),
        ]
      case 'Push':
        return [
          lifted('overhead-press', 0, 'hypertrophy', along(95, 115, through), 8),
          lifted('dips', 1, 'hypertrophy', 0, 8 + bump),
          lifted('skullcrusher', 2, 'assistance', along(50, 65, through), 18),
          lifted('french-press', 3, 'assistance', along(40, 55, through), 18),
        ]
      case 'Pull':
        return [
          lifted('pull-up', 0, 'hypertrophy', 0, 6 + bump),
          lifted('rear-delt-raise', 1, 'assistance', along(15, 20, through), 18),
          lifted('ez-bar-curl', 2, 'assistance', along(50, 65, through), 18),
          lifted('db-curl', 3, 'assistance', along(25, 35, through), 18),
        ]
      case 'Legs B':
        return [
          lifted('sumo-deadlift', 0, 'strength', along(265, 315, through), 5, strengthSets),
          lifted('front-squat', 1, 'hypertrophy', along(135, 175, through), 6),
          version(
            lifted('barbell-calf-raise', 2, 'assistance', along(120, 150, through), 25),
            'Light',
          ),
          lifted('hanging-leg-raise', 3, 'assistance', 0, 10 + bump),
        ]
    }
  }

  const sessions: { daysBack: number; title: string; entries: LogEntry[] }[] = []
  for (let back = WEEKS * 7; back >= 1; back -= 1) {
    const on = new Date(deps.clock.now().getTime() - back * 86_400_000)
    const day = DAYS[on.getDay()]
    if (day === undefined) continue
    if ((back * 7) % 13 === 3) continue

    const through = 1 - back / (WEEKS * 7)
    const work = session(day, through, back % 4 === 0)
    /* Most sessions open on the warm-up; a few skip it, as real ones do. */
    const entries =
      back % 5 === 0
        ? work
        : [warmed(), ...work.map((entry) => ({ ...entry, order: entry.order + 1 }))]
    sessions.push({ daysBack: back, title: day, entries })
  }

  for (const session of sessions) {
    const on = new Date(deps.clock.now().getTime() - session.daysBack * 86_400_000)
    const log: WorkoutLog = {
      id: deps.ids.next() as WorkoutId,
      date: dayKeyAgo(deps.clock, session.daysBack),
      startedAt: daysAgo(deps.clock, session.daysBack),
      completedAt: daysAgo(deps.clock, session.daysBack),
      status: 'completed',
      /*
       * **The weekday is read off the date rather than written beside
       * it.** The app titles a session "Monday — Squat", and a fixture
       * that hardcoded the word would be right on the day it was written
       * and wrong every day after — a session dated Thursday reading
       * "Friday", which is the exact rot relative dates exist to avoid,
       * reintroduced in the label.
       */
      title: `${on.toLocaleDateString('en-US', { weekday: 'long' })} — ${session.title}`,
      entries: session.entries,
    }
    await deps.workouts.save(log)
  }
}
