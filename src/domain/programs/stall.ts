import { isProgress, versusLast, type Performance } from '@/domain/logging/versus-last'
import { roundLoad } from '@/domain/units/weight'
import type { ExerciseId } from '@/domain/ids/ids'
import { exerciseHistory } from '@/domain/logging/exercise-history'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { shiftDay } from '@/domain/time/day'

/**
 * When an exercise has stopped moving, and where to go from.
 *
 * Double progression has one answer to a bad session: do it again. That
 * is right for a session or two and wrong for a month — repeating a load
 * that has not moved in three sessions is grinding against a wall, and
 * the method itself says nothing about when to stop. **A stall is three
 * sessions in a row that did not beat the best before them**, by the rule
 * every other screen uses (`versusLast`): no heavier bar, and no more
 * reps at the same one.
 *
 * **The way out is offered, never taken.** A reset drops the bar about a
 * tenth — `RESET_SHARE`, rounded down to something loadable — so the reps
 * come back and the climb restarts with room in it. It is the standard
 * answer to a double-progression stall; the lifter may know better (a
 * bad week, a cut), which is why it waits to be asked for.
 */
export const STALL_SESSIONS = 3
export const RESET_SHARE = 0.9

/**
 * How many sessions in a row, ending with the latest, did not beat the
 * best top set before them. `tops` are the sessions' top sets, oldest
 * first.
 *
 * **Against the best so far, not the session before**, and the first
 * version was the other way: reps that bounce 6, 5, 6 read as progress
 * on every rebound, so an exercise going nowhere for a month was never
 * called stalled. Getting back to where you were is not moving forward.
 */
export function sessionsWithoutProgress(tops: readonly Performance[]): number {
  let best = tops[0]
  let count = 0
  for (const now of tops.slice(1)) {
    const versus = best === undefined ? undefined : versusLast(now, best)
    // A lighter bar is a new climb — a reset, or a deliberate step back —
    // and is measured from where it starts, not against the old best.
    if (versus === undefined || isProgress(versus) || versus.kind === 'lighter') {
      best = now
      count = 0
    } else {
      count += 1
    }
  }
  return count
}

export function isStalled(tops: readonly Performance[]): boolean {
  return sessionsWithoutProgress(tops) >= STALL_SESSIONS
}

/** The bar to restart from: about nine tenths, rounded down to something loadable. */
export function resetLoad(load: number, increment: number): number {
  return roundLoad(load * RESET_SHARE, increment, 'down')
}

/**
 * A reset the lifter accepted: the bar the next session of an exercise
 * opens on, and when it was chosen. It holds until a session of that
 * exercise is started after that — from then on the log is the source
 * again, as it always is.
 */
export interface LoadReset {
  readonly load: number
  /**
   * When it was accepted, as an instant. **Not a day**: a reset accepted
   * after a session on the same day must still apply to the next one, and
   * compared by day the session would read as having lifted it already —
   * the moment somebody is most likely to press the button.
   */
  readonly at: string
}

export type LoadResets = Readonly<Record<string, LoadReset>>

/**
 * The key a reset is filed under: the exercise, and its version where it
 * has two — a heavy calf raise reset must not move the light one.
 */
export function resetKey(exerciseId: string, version: string | undefined): string {
  return version === undefined ? exerciseId : `${exerciseId}#${version}`
}

/** Whether an accepted reset still governs the next session of its exercise. */
export function resetPending(
  reset: LoadReset | undefined,
  latestStartedAt: string | undefined,
): boolean {
  return reset !== undefined && (latestStartedAt === undefined || latestStartedAt < reset.at)
}

/** At least this many exercises stalled at once reads as fatigue rather than one lift. */
export const FATIGUE_STALLS = 3
/** How recently an exercise must have been trained for its stall to count. */
const RECENT_DAYS = 21

/**
 * Which exercises are stalled across the training, newest-trained first —
 * **one stall is a lift; several at once is the lifter.** When three or
 * more exercises trained in the last three weeks have each gone three
 * sessions without beating their best, the likelier cause is accumulated
 * fatigue, and the honest offer is the deload week the programme already
 * has, taken now rather than when the calendar reaches it.
 */
export function stalledExercises(
  logs: readonly WorkoutLog[],
  today: string,
): readonly ExerciseId[] {
  const since = shiftDay(today, -RECENT_DAYS)
  const recent = new Set(
    logs
      .filter((log) => log.status === 'completed' && log.date >= since)
      .flatMap((log) => log.entries.map((entry) => entry.exerciseId)),
  )
  return [...recent].filter((id) =>
    exerciseHistory(logs, id).some((series) =>
      isStalled(series.sessions.map((session) => session.top)),
    ),
  )
}
