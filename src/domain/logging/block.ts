import type { ExerciseId } from '@/domain/ids/ids'
import { DAY_VERSIONS } from '@/domain/splits/rp-splits'
import { mondayOf, parseDay, shiftDay } from '@/domain/time/day'

import { sessionRecords } from './records'
import { totalTonnage, totalWorkingSets, workingSets, type WorkoutLog } from './workout-log'

const WEEK_MS = 7 * 86_400_000

/** One run through the program: its first Monday and its last Sunday. */
export interface BlockWindow {
  readonly start: string
  readonly end: string
  readonly weeks: number
}

/**
 * The block a day falls in, or one `ago` blocks before it.
 *
 * Whole weeks since the anchor Monday, cut into runs of the program's
 * length — the arithmetic `slotOn` uses to pick the week, so this window
 * and the week the Program page says you are on cannot disagree.
 */
export function blockWindow(
  blockStartedOn: string,
  blockWeeks: number,
  today: string,
  ago = 0,
): BlockWindow {
  const anchor = mondayOf(blockStartedOn)
  const elapsed = Math.floor(
    (parseDay(mondayOf(today)).getTime() - parseDay(anchor).getTime()) / WEEK_MS,
  )
  const cycle = Math.floor(Math.max(0, elapsed) / blockWeeks) - ago
  const start = shiftDay(anchor, cycle * blockWeeks * 7)
  return { start, end: shiftDay(start, blockWeeks * 7 - 1), weeks: blockWeeks }
}

export interface TopSet {
  readonly load: number
  readonly reps: number
  readonly date: string
}

export interface BlockLift {
  readonly exerciseId: ExerciseId
  /** Heavy or Light where an exercise runs as two versions in a week. */
  readonly version?: string
  readonly from: TopSet
  readonly to: TopSet
  /** The change in top-set load as a fraction of where it started. */
  readonly change: number
}

export interface BlockReport {
  readonly window: BlockWindow
  /** The last day counted: the block's end, or today while it runs. */
  readonly through: string
  readonly sessions: number
  readonly sets: number
  readonly tonnage: number
  readonly records: number
  /** Working sets in each week of the block, in order. */
  readonly perWeek: readonly number[]
  /** Exercises loaded in two or more sessions, biggest change first. */
  readonly lifts: readonly BlockLift[]
}

/**
 * A block, start to finish: totals, records, sets by week, and how far
 * each loaded exercise's top set moved from its first session in the
 * block to its last.
 *
 * **The top set is the heaviest bar**, more reps breaking a tie — the
 * rule the records wall uses. A bodyweight movement with no added load
 * has no bar to move and is left out rather than read as zero. One
 * session is not a change, so an exercise needs two. **A day version
 * (Heavy, Light) is its own line**, as on the exercise page: a light calf
 * raise after a heavy one is not the lift going down.
 */
export function blockReport(
  logs: readonly WorkoutLog[],
  window: BlockWindow,
  today: string,
): BlockReport {
  const through = today < window.end ? today : window.end
  const finished = logs.filter((log) => log.status === 'completed')
  const inBlock = finished
    .filter((log) => log.date >= window.start && log.date <= through)
    .toSorted((a, b) => a.date.localeCompare(b.date))

  const recordsBy = sessionRecords(finished)
  const perWeek = Array.from({ length: window.weeks }, (_, week) => {
    const monday = shiftDay(window.start, week * 7)
    const sunday = shiftDay(monday, 6)
    return inBlock
      .filter((log) => log.date >= monday && log.date <= sunday)
      .reduce((sum, log) => sum + totalWorkingSets(log), 0)
  })

  const tops = new Map<
    string,
    { exerciseId: ExerciseId; version: string | undefined; sets: TopSet[] }
  >()
  for (const log of inBlock) {
    for (const entry of log.entries) {
      const top = topOf(workingSets(entry), log.date)
      if (top === undefined) continue
      const version =
        entry.variant !== undefined && DAY_VERSIONS.includes(entry.variant)
          ? entry.variant
          : undefined
      const key = `${entry.exerciseId}|${version ?? ''}`
      const series = tops.get(key) ?? { exerciseId: entry.exerciseId, version, sets: [] }
      series.sets.push(top)
      tops.set(key, series)
    }
  }
  const lifts = [...tops.values()]
    .flatMap(({ exerciseId, version, sets }) => {
      const from = sets[0]
      const to = sets.at(-1)
      return sets.length < 2 || from === undefined || to === undefined
        ? []
        : [
            {
              exerciseId,
              ...(version === undefined ? {} : { version }),
              from,
              to,
              change: (to.load - from.load) / from.load,
            },
          ]
    })
    .toSorted((a, b) => b.change - a.change)

  return {
    window,
    through,
    sessions: inBlock.length,
    sets: inBlock.reduce((sum, log) => sum + totalWorkingSets(log), 0),
    tonnage: inBlock.reduce((sum, log) => sum + totalTonnage(log), 0),
    records: inBlock.reduce((sum, log) => sum + (recordsBy.get(log.id)?.length ?? 0), 0),
    perWeek,
    lifts,
  }
}

function topOf(
  sets: readonly { readonly actualLoad?: number; readonly actualReps?: number }[],
  date: string,
): TopSet | undefined {
  let best: TopSet | undefined
  for (const set of sets) {
    const load = set.actualLoad
    const reps = set.actualReps
    if (load === undefined || load <= 0 || reps === undefined) continue
    if (best === undefined || load > best.load || (load === best.load && reps > best.reps)) {
      best = { load, reps, date }
    }
  }
  return best
}
