import type { ExerciseId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'

/**
 * Where a session's time went, read off the stamps every logged set
 * already carries.
 *
 * **Rest is measured between sets of one exercise only.** The gap from
 * the last bench set to the first row is walking to the rack and loading
 * a bar, not rest, and folding it in would make every session look like
 * it rested too long. Each exercise is a band from its first set to its
 * last, so a session where the row took twenty minutes says so without a
 * number.
 *
 * Absent unless sets carry at least two different times — a session
 * written before sets were stamped, or filed in one go so that every set
 * shares an instant, has no timeline to draw.
 */
export interface TimelineBand {
  readonly exerciseId: ExerciseId
  readonly from: number
  readonly to: number
  /** Set times, as milliseconds since the session started. */
  readonly sets: readonly number[]
  readonly warmup: boolean
}

export interface Timeline {
  /** Milliseconds from start to finish. */
  readonly length: number
  readonly bands: readonly TimelineBand[]
  /** Median rest between sets of one exercise, in milliseconds. */
  readonly medianRest?: number
  readonly longestRest?: number
}

export function sessionTimeline(log: WorkoutLog): Timeline | undefined {
  const start = Date.parse(log.startedAt)
  if (!Number.isFinite(start)) return undefined

  const bands: TimelineBand[] = []
  const rests: number[] = []

  for (const entry of log.entries) {
    const times = entry.sets
      .filter((set) => set.outcome === 'completed' && set.completedAt !== undefined)
      .map((set) => Date.parse(set.completedAt ?? '') - start)
      .filter((at) => Number.isFinite(at) && at >= 0)
      .sort((a, b) => a - b)
    const first = times[0]
    const last = times.at(-1)
    if (first === undefined || last === undefined) continue

    const warmup = entry.sets.every((set) => set.isWarmup)
    bands.push({ exerciseId: entry.exerciseId, from: first, to: last, sets: times, warmup })
    if (!warmup) {
      for (let i = 1; i < times.length; i += 1) rests.push((times[i] ?? 0) - (times[i - 1] ?? 0))
    }
  }

  // Two sets at one instant is a session filed in one go, not a timeline.
  const moments = new Set(bands.flatMap((band) => band.sets))
  if (moments.size < 2) return undefined

  const end = log.completedAt === undefined ? Number.NaN : Date.parse(log.completedAt) - start
  const lastSet = Math.max(...bands.map((band) => band.to))
  const sorted = [...rests].sort((a, b) => a - b)

  return {
    length: Number.isFinite(end) && end >= lastSet ? end : lastSet,
    bands: bands.sort((a, b) => a.from - b.from),
    ...(sorted.length === 0
      ? {}
      : {
          medianRest: sorted[Math.floor(sorted.length / 2)] ?? 0,
          longestRest: sorted.at(-1) ?? 0,
        }),
  }
}
