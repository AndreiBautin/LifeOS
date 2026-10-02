import { describe, expect, it } from 'vitest'

import { asExerciseId, asWorkoutId, type WorkoutId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'

import { reopenWorkout, type ReopenWorkoutDeps } from './reopen-workout'

/**
 * The verb the app was missing.
 *
 * Finishing is one tap on the largest control on the Train screen, and
 * the only way back from a mis-tap was deleting — which erases the sets
 * that were genuinely performed in order to undo the one that was not.
 */

const set = (outcome: LoggedSet['outcome']): LoggedSet => ({
  prescription: { load: { kind: 'rpe', target: 9 }, reps: { kind: 'fixed', reps: 5 } },
  outcome,
  isWarmup: false,
})

const entry = (outcomes: LoggedSet['outcome'][]): LogEntry => ({
  exerciseId: asExerciseId('bench-press'),
  role: 'hypertrophy',
  order: 0,
  sets: outcomes.map(set),
})

const AT = { blockIndex: 0, cycleNumber: 1, weekIndex: 0, dayIndex: 2 }

function workout(over: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: asWorkoutId('w1'),
    date: '2026-08-26',
    title: 'Wednesday',
    status: 'completed',
    startedAt: '2026-08-26T09:00:00.000Z',
    completedAt: '2026-08-26T10:00:00.000Z',
    position: AT,
    entries: [entry(['completed', 'completed', 'pending'])],
    ...over,
  }
}

/**
 * Doubles narrow to exactly what the use-case reaches for.
 *
 * `recent` returns newest first, as the real repository does — the
 * "is this the latest session" guard is read off its first element, so a
 * double that ordered them the other way would make that test pass
 * against a broken check.
 */
function build(log: WorkoutLog, others: readonly WorkoutLog[] = []) {
  const all = [log, ...others]
  let saved: WorkoutLog | undefined

  const workouts: ReopenWorkoutDeps['workouts'] = {
    byId: (id: WorkoutId) => Promise.resolve(all.find((one) => one.id === id)),
    inProgress: () => Promise.resolve(all.find((one) => one.status === 'in-progress')),
    recent: (limit: number) => Promise.resolve(all.slice(0, limit)),
    save: (next: WorkoutLog) => {
      saved = next
      return Promise.resolve()
    },
  } as unknown as ReopenWorkoutDeps['workouts']

  return {
    saved: () => saved,
    args: { workouts },
  }
}

describe('reopening a session finished by mistake', () => {
  it('puts it back in progress and keeps the sets already logged', () => {
    const log = workout()
    const d = build(log)

    return reopenWorkout(log.id, d.args).then((result) => {
      expect(result.kind).toBe('reopened')
      expect(d.saved()?.status).toBe('in-progress')
      // The whole point: nothing performed is thrown away.
      expect(d.saved()?.entries[0]?.sets.filter((s) => s.outcome === 'completed')).toHaveLength(2)
    })
  })

  it('clears the completion time along with the status', async () => {
    // A completion time on a running session is a small lie that outlives
    // the mistake, and later reports read it without questioning.
    const log = workout()
    const d = build(log)

    await reopenWorkout(log.id, d.args)

    expect(d.saved()?.completedAt).toBeUndefined()
  })

  it('refuses a session with nothing left to do', async () => {
    // Reopening a genuinely complete session is an edit of history
    // wearing a resumption's clothes. Editing a logged set is a different
    // feature and should look like one.
    const log = workout({ entries: [entry(['completed', 'completed'])] })
    const d = build(log)

    expect((await reopenWorkout(log.id, d.args)).kind).toBe('nothing-left')
    expect(d.saved()).toBeUndefined()
  })

  it('refuses while another session is open', async () => {
    // The same invariant `startWorkout` enforces from the other side. Two
    // would make "the current session" ambiguous everywhere it is read.
    const log = workout()
    const open = workout({ id: asWorkoutId('w2'), status: 'in-progress' })
    const d = build(log, [open])

    expect((await reopenWorkout(log.id, d.args)).kind).toBe('session-open')
    expect(d.saved()).toBeUndefined()
  })

  it('refuses when a later session has already been filed', async () => {
    /*
     * Rolling back to a session with a later one in the history would
     * have the lifter repeat days they have since trained, and the second
     * pass would file logs out of order. Refused rather than resolved —
     * the honest recovery there is a freestyle session for the missing
     * sets, which costs a row and loses nothing.
     */
    const later = workout({ id: asWorkoutId('w2'), date: '2026-08-27' })
    const log = workout()
    const d = build(later, [log])

    expect((await reopenWorkout(log.id, d.args)).kind).toBe('not-the-latest')
    expect(d.saved()).toBeUndefined()
  })

  it('reports a missing workout rather than throwing', async () => {
    const log = workout()
    const d = build(log)

    expect((await reopenWorkout(asWorkoutId('nope'), d.args)).kind).toBe('missing')
  })
})
