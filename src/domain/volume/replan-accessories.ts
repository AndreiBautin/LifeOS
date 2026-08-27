import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId } from '@/domain/ids/ids'
import type { LogEntry, LoggedSet, WorkoutLog } from '@/domain/logging/workout-log'
import { countsAsWorking, slotVolume } from '@/domain/volume/accounting'

/**
 * Resizing the accessory work to whatever the strength work actually
 * delivered.
 *
 * The plan has to guess at one number and cannot check it. RTS back-off
 * volume is discovered — you stop when the implied max has fallen by the
 * day's allowance — but the assembler must materialise something, so it
 * materialises the cap, counts all of it, and then *subtracts* it from
 * what the accessories are asked to cover. Stop at two back-offs instead
 * of four and the session is short twice over: the sets you did not do,
 * and the dips that were never scheduled because it assumed you would.
 *
 * So the accessories stop being fixed. A day states how many sets each
 * muscle it is for should end up with, and the exercise that trains that
 * muscle directly grows or shrinks to meet it as the session actually
 * unfolds.
 *
 * **Skipping is the signal.** A pending back-off and a back-off you are
 * about to do look identical, so nothing moves while sets are merely
 * unlogged — the projection assumes every pending set will happen. It is
 * skipping the rest of the back-offs that tells the app the strength work
 * is over, and that is a first-class action on every set row already.
 *
 * The one thing worth being uneasy about: a day you stop early is usually
 * a day you feel beaten up, and this responds by adding sets. The trade
 * is defensible — five sets at ninety-five percent cost far more than
 * three sets of dips at the same credited volume — but it is a judgement,
 * not arithmetic, and {@link MAX_ACCESSORY_SETS} is the bound on how far
 * it goes.
 */

/**
 * Ceiling on one accessory slot, matching the assembler's own.
 *
 * Without it, a session where the strength work collapsed could grow a
 * single exercise without limit, which is the failure mode of every
 * "fill until the number is met" rule: it produces a number that is met
 * and a session nobody would do.
 */
export const MAX_ACCESSORY_SETS = 8

/** Roles that may be resized. Warm-ups, strength and conditioning stay put. */
const RESIZABLE = new Set(['hypertrophy', 'assistance'])

export function replanAccessoryVolume(
  workout: WorkoutLog,
  lookup: (id: ExerciseId) => Exercise | undefined,
): WorkoutLog {
  const targets = workout.volumeTargets
  if (targets === undefined) return workout

  let entries = workout.entries

  for (const [muscle, target] of Object.entries(targets) as [MuscleGroup, number][]) {
    if (target <= 0) continue

    const at = resizableEntryFor(entries, muscle, lookup)
    if (at === -1) continue

    entries = resize(entries, at, muscle, target, lookup)
  }

  return entries === workout.entries ? workout : { ...workout, entries }
}

/**
 * The entry that trains this muscle directly and may still be changed.
 *
 * Directly, because a muscle short of its target is fixed by training it,
 * not by adding an exercise that pays it half credit on the way past. The
 * *last* such entry, because the session is worked top to bottom and the
 * one furthest from being started is the one it is least strange to
 * resize under the lifter.
 */
function resizableEntryFor(
  entries: readonly LogEntry[],
  muscle: MuscleGroup,
  lookup: (id: ExerciseId) => Exercise | undefined,
): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry === undefined || !RESIZABLE.has(entry.role)) continue

    const exercise = lookup(entry.exerciseId)
    if (exercise?.primaryMuscle !== muscle) continue

    // Nothing to resize once every set is performed or refused. Growing a
    // finished exercise would ask a lifter to go back to it.
    if (!entry.sets.some((set) => set.outcome === 'pending')) continue

    return index
  }

  return -1
}

function resize(
  entries: readonly LogEntry[],
  at: number,
  muscle: MuscleGroup,
  target: number,
  lookup: (id: ExerciseId) => Exercise | undefined,
): readonly LogEntry[] {
  const entry = entries[at]
  if (entry === undefined) return entries

  const template = entry.sets.find((set) => set.outcome === 'pending')
  if (template === undefined) return entries

  const exercise = lookup(entry.exerciseId)
  if (exercise === undefined) return entries

  const perSet = slotVolume(exercise, [template.prescription])[muscle]
  if (perSet <= 0) return entries

  /*
   * Solved from the rest of the session rather than adjusted by a delta.
   *
   * This runs after every logged set, so it has to land on the same
   * answer each time given the same session — an incremental "add one
   * more" would ratchet upward on every keystroke. Asking what this
   * exercise would have to be, given everything else, is idempotent and
   * shrinks as readily as it grows.
   */
  const elsewhere = projected(entries, lookup, at)[muscle] ?? 0
  const needed = Math.ceil((target - elsewhere) / perSet)

  // Never below what has already been performed or refused: those sets
  // are history, and the count cannot go under them.
  const settled = entry.sets.filter((set) => set.outcome !== 'pending').length
  const wanted = Math.max(settled, Math.min(MAX_ACCESSORY_SETS, needed))

  if (wanted === entry.sets.length) return entries

  const sets =
    wanted < entry.sets.length
      ? trimPending(entry.sets, wanted)
      : [
          ...entry.sets,
          ...Array.from({ length: wanted - entry.sets.length }, () => ({ ...template })),
        ]

  return entries.map((candidate, index) => (index === at ? { ...candidate, sets } : candidate))
}

/** Drops pending sets from the end, leaving performed ones untouched. */
function trimPending(sets: readonly LoggedSet[], wanted: number): readonly LoggedSet[] {
  const kept = [...sets]

  for (let index = kept.length - 1; index >= 0 && kept.length > wanted; index -= 1) {
    if (kept[index]?.outcome === 'pending') kept.splice(index, 1)
  }

  return kept
}

/**
 * Credited volume the session will have delivered, assuming every pending
 * set is performed as planned.
 *
 * Pending sets count. That is the whole reason nothing moves until a set
 * is skipped — a back-off you have not reached yet is work you are about
 * to do, and treating it as absent would grow the accessories the moment
 * the session started.
 *
 * Skipped sets count for nothing, which is what makes skipping the
 * signal.
 */
function projected(
  entries: readonly LogEntry[],
  lookup: (id: ExerciseId) => Exercise | undefined,
  ignore: number,
): Partial<Record<MuscleGroup, number>> {
  const total: Partial<Record<MuscleGroup, number>> = {}

  for (const [index, entry] of entries.entries()) {
    if (index === ignore) continue

    const exercise = lookup(entry.exerciseId)
    if (exercise === undefined) continue

    const counted = entry.sets.filter(
      (set) => set.outcome !== 'skipped' && countsAsWorking(set.prescription),
    )
    if (counted.length === 0) continue

    const credit = slotVolume(
      exercise,
      counted.map((set) => set.prescription),
    )[exercise.primaryMuscle]

    // Primary only, matching `slotVolume`. A replan that credited
    // secondaries would size the accessories against a different total
    // than the one the plan was built from, which is the two-implementations
    // failure this file already avoids by asking `slotVolume` for the
    // primary figure rather than recomputing it.
    total[exercise.primaryMuscle] = (total[exercise.primaryMuscle] ?? 0) + credit
  }

  return total
}
