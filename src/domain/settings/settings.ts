import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import type { E1rmFormula } from '@/domain/strength/one-rep-max'
import type { WeightUnit } from '@/domain/units/weight'
import type { LoadResets } from '@/domain/programs/stall'
import type { LiftGoals } from '@/domain/strength/goal'

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
export const SAMPLE_DATA_STATES = ['loaded', 'kept', 'cleared'] as const
export type SampleDataState = (typeof SAMPLE_DATA_STATES)[number]

/**
 * Whether this device's records include the generated sample.
 *
 * **Sync must never carry the sample.** A fresh install of the demo build
 * fills itself, and connecting it to a real sync file merged ninety-four
 * made-up sessions into a lifter's history — the merge cannot tell a
 * sample record from a real one, so the only safe moment to separate them
 * is before the device first syncs. `kept` counts too: dismissing the
 * note hides it, and the records are still the sample.
 */
export function holdsSampleData(settings: { readonly sampleData?: SampleDataState }): boolean {
  return settings.sampleData === 'loaded' || settings.sampleData === 'kept'
}

export interface AppSettings {
  readonly units: WeightUnit
  readonly roundingIncrement: number
  readonly bodyweight?: number
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

  /**
   * The plates to hand, when not the standard set — a home gym with no
   * 35s, say. Absent means the standard set; read back through
   * `platesToHand`, which drops anything that is not a plate in the
   * current unit, so switching units cannot leave a gym with no plates.
   */
  readonly plates?: readonly number[]

  readonly e1rmFormula: E1rmFormula
  readonly restTimerEnabled: boolean
  readonly keepScreenAwake: boolean

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
  /**
   * Where the sample data stands on this browser. `loaded` shows the
   * "you are looking at sample data" note; `kept` means it was dismissed;
   * `cleared` means the person chose to start fresh, and is what stops a
   * demo build refilling an empty database on the next open.
   */
  readonly sampleData?: SampleDataState
  /**
   * The first-run setup has been finished or skipped. Absent on every
   * device that predates it, which is why the setup also asks whether
   * anything has been logged: somebody with a history is past it.
   */
  readonly setupDone?: boolean
  /** A set has been swiped, so the rows stop showing that they can be. */
  readonly swipeLearned?: boolean
  /**
   * Resets accepted for stalled exercises, by `resetKey`. Each holds until
   * a session of the exercise is logged after the day it was accepted.
   */
  readonly loadResets?: LoadResets
  /** A goal per competition lift, with a date (`domain/strength/goal`). */
  readonly liftGoals?: LiftGoals
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
