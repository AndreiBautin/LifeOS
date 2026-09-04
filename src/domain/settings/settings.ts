import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import type { E1rmFormula } from '@/domain/strength/one-rep-max'
import type { WeightUnit } from '@/domain/units/weight'

/**
 * Everything about the lifter that is not a program or a workout.
 *
 * Kept as one record because it is small, always read together, and needs
 * to survive an IndexedDB rebuild — it lives in localStorage rather than
 * in the object store for exactly that reason. Losing your unit
 * preference is an annoyance; losing it *and* your history at the same
 * time is a disaster, and separating the two means a corrupted database
 * does not take the settings with it.
 */
export interface AppSettings {
  readonly units: WeightUnit
  readonly roundingIncrement: number
  readonly bodyweight?: number
  /**
   * The year you were born, for the two finance ladders.
   *
   * **Not a birthday, and not stored as one.** Both published standards
   * are bracketed in five-year bands, so a month and a day would be a
   * date of birth in the database to make a reading half a percentile
   * more accurate. See `domain/finance/standards.ts`.
   *
   * Absent by default and absent is a real answer: with no year the two
   * ladders report nothing rather than guessing an age, which is the
   * same stance `bodyweight` takes for the strength standards.
   */
  readonly birthYear?: number
  /**
   * What the lifter can do for one rep, per exercise.
   *
   * The basis for every suggested load. RTS prescribes reps at an RPE
   * rather than a percentage, so this number never decides what the set
   * *is* — get it wrong and the suggestion is wrong, which the lifter
   * corrects by loading the bar they were going to load anyway. That is
   * why an estimate is an acceptable basis here where it would not have
   * been under a percentage-driven program.
   */
  readonly estimatedMaxes: Readonly<Partial<Record<ExerciseId, number>>>

  /**
   * Exercises the lifter cannot or will not do.
   *
   * Absolute, and checked everywhere the assembler picks something —
   * anchors, warm-ups and conditioning included, not only the hypertrophy
   * picker.
   */
  readonly excludedExercises: readonly ExerciseId[]

  readonly e1rmFormula: E1rmFormula
  readonly restTimerEnabled: boolean
  readonly keepScreenAwake: boolean
  readonly checkInsEnabled: boolean

  /**
   * The area, in square kilometres, of the region being explored.
   *
   * The denominator of the exploration ladder, and the only part of it the
   * app cannot work out for itself. The ladder is justified by having a
   * genuinely external ceiling — a named region has a boundary and you can
   * walk all of it — so the boundary has to come from somewhere, and the
   * only honest source is the person who knows which region they mean.
   *
   * Optional, and absent means the ladder reads nothing at all rather than
   * scoring against a made-up figure. Greater London is about 1,572; a
   * borough is nearer 40.
   *
   * Accepts an explicit `undefined` where the stored records do not,
   * because clearing the box has to be expressible and these settings are
   * JSON in localStorage — a key holding `undefined` does not survive
   * `JSON.stringify` at all, so absent and undefined cannot be told apart
   * on the way back in.
   */
  readonly exploredRegionKm2?: number | undefined

  readonly theme: 'system' | 'light' | 'dark'
  /**
   * ISO timestamp of the last successful export. Drives the backup
   * reminder — a backup feature nobody is prompted to use is worth
   * nothing, and this is local-only storage.
   */
  /**
   * When the synced half of these settings last changed.
   *
   * On the blob rather than per field, because nobody edits their tiers
   * on two devices at once and a half-merged settings object derives a
   * program matching neither device. Stamped by `writeSettings`, which
   * is the single path anything takes to reach storage.
   *
   * Optional because settings saved before this existed have none, and
   * such a copy loses every comparison — it cannot prove it is newer,
   * which is the rule records and tombstones already follow.
   */
  readonly updatedAt?: string
  readonly lastExportAt?: string
  readonly schemaVersion: number
}

/**
 * Bumped when a stored setting can no longer express what the app means
 * by it, so the parse can re-seed that field instead of carrying an
 * answer to a question that has changed.
 *
 * **2** — the overhead press became a fourth strength lift and the bench
 * dropped to one session a week, so a `liftSessions` map written before
 * that had to be replaced wholesale rather than completed.
 *
 * **It is written and, right now, read by nothing.** `liftSessions` was
 * its only reader and the field is gone with the rest of the volume
 * customisation. That is the shape this codebase keeps warning about, and
 * it is kept deliberately anyway: the gap it exists for has not closed.
 * Settings are persisted on first run, so **the store still cannot tell a
 * value the lifter chose from a default it saved on their behalf**, and
 * the next setting whose meaning changes needs a version already sitting
 * in every stored blob to compare against. Deleting it would mean the
 * devices that matter had no version on the day one was wanted.
 *
 * It is not a licence to reset settings whenever the defaults move — a
 * lifter who has chosen something keeps it.
 */
export const SETTINGS_SCHEMA_VERSION = 2

export const DEFAULT_SETTINGS: AppSettings = {
  units: 'lb',
  roundingIncrement: 5,
  // From the same 5/3/1 export. Needed as well as the maxes: every
  // strength standard is a multiple of bodyweight, so without it the
  // character sheet can only say "set your bodyweight".
  bodyweight: 200,
  // Read out of the 5/3/1 export, each from the best completed work set
  // in it: 260x5, 195x5, 315x5 and 130x5. A starting point for the RTS
  // suggestions, not a claim — the top set corrects them the first time
  // each lift is trained.
  /*
   * Read back through the RPE chart from real top sets rather than
   * guessed: 305 x 3 and 205 x 3 at RPE 8, which the chart puts at 86.3%
   * of max for a triple.
   *
   * **A change here reaches nobody who has already opened the app.**
   * `settings-store` takes stored maxes wholesale when there are any, so
   * this is the fresh-install figure and nothing else — see the note on
   * `SETTINGS_SCHEMA_VERSION`. Anyone with the app already installed
   * updates theirs from a finished session or by hand.
   */
  estimatedMaxes: {
    [asExerciseId('low-bar-squat')]: 353,
    // The paused bench is the competition lift and the one the character
    // sheet scores; the touch-and-go number is the same bar without the
    // pause, so it sits about five per cent higher.
    [asExerciseId('paused-bench-press')]: 226,
    [asExerciseId('bench-press')]: 238,
    [asExerciseId('sumo-deadlift')]: 368,
    [asExerciseId('overhead-press')]: 152,
  },
  excludedExercises: [],
  // Deliberately unset: a default calorie target would be a guess
  // presented as a decision the lifter had made.
  e1rmFormula: 'epley',
  restTimerEnabled: true,
  keepScreenAwake: true,
  checkInsEnabled: true,
  theme: 'system',
  schemaVersion: SETTINGS_SCHEMA_VERSION,
}

/** Days since the last export before the line starts saying so. */
export const BACKUP_STALE_DAYS = 14

export interface BackupAge {
  /** Whole days since the last export, absent if there has never been one. */
  readonly days?: number
  /** True once an export is old enough — or missing — to be worth saying. */
  readonly stale: boolean
}

/**
 * How long ago the last backup was, as a reading rather than a warning.
 *
 * **This replaced a card that nagged on every screen**, and the shape of
 * the replacement is the whole point: it reports, it does not interrupt,
 * and it sits beside the button that acts on it. The card was dismissed
 * per session, so it came back at every launch — which teaches somebody
 * to look past that part of the screen rather than to take a backup.
 *
 * It deliberately says nothing about **what is at risk**. That depends on
 * whether sync is configured, which this function cannot see and which
 * the old card asserted regardless — it said "everything lives on this
 * device only" whether or not that was true. The screen pairs this with
 * the sync state it already holds.
 *
 * Never having exported is `stale` with no `days`: absent rather than
 * zero, because "no export" is not "an export nought days ago".
 */
export function backupAge(settings: AppSettings, now: Date): BackupAge {
  if (settings.lastExportAt === undefined) return { stale: true }

  const days = Math.floor(
    (now.getTime() - new Date(settings.lastExportAt).getTime()) / (1000 * 60 * 60 * 24),
  )

  return { days, stale: days >= BACKUP_STALE_DAYS }
}
