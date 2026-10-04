import type { ExerciseId } from '@/domain/ids/ids'

import type { WorkoutLog } from './workout-log'

/** One logged set, placed in time from the session's start. */
export interface ReplayFrame {
  /** Milliseconds since the session started. */
  readonly at: number
  readonly entryIndex: number
  readonly exerciseId: ExerciseId
  /** Its number among the entry's working sets, from 1; absent for a warm-up. */
  readonly setNumber?: number
  readonly load?: number
  readonly reps?: number
  readonly warmup: boolean
}

/**
 * A session's logged sets in the order they happened, each at its time.
 *
 * **Only sets carrying their own stamp are placed** — the same evidence the
 * timeline draws from — and a session with fewer than two different times
 * has nothing to replay: every set at one instant is a session filed in one
 * go, not one that unfolded. Ties keep the order of the log.
 */
export function replayFrames(log: WorkoutLog): readonly ReplayFrame[] {
  const start = Date.parse(log.startedAt)
  if (!Number.isFinite(start)) return []
  const frames: ReplayFrame[] = []
  log.entries.forEach((entry, entryIndex) => {
    let working = 0
    for (const set of entry.sets) {
      if (!set.isWarmup) working += 1
      if (set.outcome !== 'completed' || set.completedAt === undefined) continue
      const at = Date.parse(set.completedAt) - start
      if (!Number.isFinite(at) || at < 0) continue
      frames.push({
        at,
        entryIndex,
        exerciseId: entry.exerciseId,
        ...(set.isWarmup ? {} : { setNumber: working }),
        ...(set.actualLoad === undefined ? {} : { load: set.actualLoad }),
        ...(set.actualReps === undefined ? {} : { reps: set.actualReps }),
        warmup: set.isWarmup,
      })
    }
  })
  const sorted = frames
    .map((frame, order) => ({ frame, order }))
    .sort((a, b) => a.frame.at - b.frame.at || a.order - b.order)
    .map(({ frame }) => frame)
  return new Set(sorted.map((frame) => frame.at)).size < 2 ? [] : sorted
}

/** The frame showing at a moment: the last set logged at or before it. */
export function frameAt(frames: readonly ReplayFrame[], at: number): ReplayFrame | undefined {
  let shown: ReplayFrame | undefined
  for (const frame of frames) {
    if (frame.at > at) break
    shown = frame
  }
  return shown
}
