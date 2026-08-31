import { DEFAULT_WANTS, type HomeWants } from '@/domain/homes/candidate'
import { DEFAULT_DIGEST, type DigestPreferences } from '@/domain/news/digest'
import { EMPTY_JOB_SEARCH, type JobSearch } from '@/domain/jobs/search'
import { PHASE_RATES, type Phase } from '@/domain/vitals/weight'
import { DEFAULT_RTS } from '@/domain/framework/rts'
import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import type { E1rmFormula } from '@/domain/strength/one-rep-max'
import type { WeightUnit } from '@/domain/units/weight'
import type { LiftSessions } from '@/domain/priority/tiers'
import { DEFAULT_LIFT_SESSIONS } from '@/domain/priority/tiers'
import type { MuscleVolumes, SetsPerSession } from '@/domain/volume/levels'
import { DEFAULT_MUSCLE_VOLUMES, DEFAULT_SETS_PER_SESSION } from '@/domain/volume/levels'
import {
  DEFAULT_DAYS_PER_WEEK,
  DEFAULT_WEEKS_BEFORE_DELOAD,
} from '@/domain/autoregulation/schedule'

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
   * Sets in one session, by level, and what a deload uses instead.
   *
   * Shared by every muscle. Per-muscle numbers were four landmarks each
   * across fifteen muscles; these are four numbers total, and a muscle
   * expresses a difference by being assigned a different level rather
   * than by carrying its own table.
   */
  readonly setsPerSession: SetsPerSession

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
   * How often each muscle is trained and how hard, which between them are
   * the entire volume model — weekly sets are the product of the two.
   *
   * Zero sessions is a real answer and the one most muscles are on: the
   * muscle is maintained by whatever the competition lifts pay it.
   */
  readonly muscleVolumes: MuscleVolumes

  /** Sessions a week for each competition lift. */
  readonly liftSessions: LiftSessions

  /**
   * Where the back-off work stops, as a drop in implied max — and, being
   * the same number, how much lighter the back-off bar is.
   *
   * One value doing both jobs is what makes the stopping rule sayable in
   * a sentence: at matched reps and RPE an implied max is proportional to
   * bar weight, so stopping at an N% drop *is* the moment the N%-lighter
   * bar feels like the top set did. Splitting them into two settings
   * would make that sentence false for every pair but one.
   */
  readonly fatiguePercent: number

  /**
   * Days per week and weeks per block.
   *
   * Set by the lifter and left alone. Both used to be described as
   * autoregulated, which stopped being true when the schedule
   * autoregulation was removed — nothing has written back to either
   * since.
   */
  readonly daysPerWeek: number
  readonly weeksBeforeDeload: number
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

  /**
   * Which way the scale is meant to be going, and how fast.
   *
   * The rate is a band rather than a number because that is what
   * `stay-within-range` judges and because a single target can only ever
   * be missed: bodyweight moves several pounds a day on water alone, and
   * a phase satisfied by one exact figure would read as failing every
   * month it was actually going fine.
   *
   * Stored as a percentage of bodyweight per week. A pound a week is a
   * different ask at 150 lb and at 250, and the percentage is the form
   * that stays true as the lifter changes — which is the whole point of
   * a phase that runs for months.
   */
  readonly phase: Phase
  readonly phaseRate: { readonly min: number; readonly max: number }
  /**
   * The daily calorie target currently being eaten to.
   *
   * Supplied rather than computed, and that is the whole design of the
   * macro targets. The app cannot know a TDEE without intake data, and
   * intake lives in another app that already does it well — so this
   * takes the number that app has already settled on and corrects it
   * from the weight trend, which is the thing the other app cannot see.
   *
   * Optional, and **absent is not zero**: no stated intake means no
   * calorie total and no carbohydrate target, while protein and the fat
   * floor still stand because bodyweight is all they need.
   */
  readonly dailyCalories?: number | undefined

  readonly theme: 'system' | 'light' | 'dark'
  /**
   * The standing job search — which boards to read, and what counts as
   * a lead on them.
   *
   * Here rather than in component state, which is where it was: every
   * board slug and filter was wiped by any navigation, so the search had
   * to be retyped each time the screen was opened. It travels between
   * devices because a board slug is a fact about the search rather than
   * about the phone.
   */
  readonly jobSearch: JobSearch
  /**
   * The morning digest -- which sources, and what floats to the top.
   *
   * Travels between devices for the reason the job search does: the
   * subjects you care about are a fact about you rather than about the
   * phone, and a list that existed only on whichever device you typed it
   * into is the defect one layer up.
   */
  readonly digest: DigestPreferences
  /**
   * What you are looking for in a house.
   *
   * Travels between devices for the reason the job search does: a
   * budget and the things you want within walking distance are facts
   * about you rather than about the phone.
   */
  readonly homeWants: HomeWants
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
 * dropped to one session a week. A `liftSessions` map written before that
 * has no `press` key and a `bench` of 2.
 *
 * This exists because of a gap worth naming: settings are persisted on
 * first run, so **the store cannot tell a value the lifter chose from a
 * default it saved on their behalf.** `completeLiftSessions` correctly
 * refuses to overwrite either, which meant a shipped change to the
 * defaults reached nobody who had ever opened the app — the programme on
 * the device went on using numbers from the version it was installed
 * under, and the only way out was a button on the Settings screen that
 * nobody knew to press.
 *
 * The version is the narrow fix: it re-seeds one named field, once, when
 * the meaning of that field has actually changed. It is not a licence to
 * reset settings whenever the defaults move — a lifter who has chosen
 * something keeps it, and the divergence card on the Settings screen is
 * still how *that* is surfaced.
 */
export const SETTINGS_SCHEMA_VERSION = 2

export const DEFAULT_SETTINGS: AppSettings = {
  units: 'lb',
  roundingIncrement: 5,
  // From the same 5/3/1 export. Needed as well as the maxes: every
  // strength standard is a multiple of bodyweight, so without it the
  // character sheet can only say "set your bodyweight".
  bodyweight: 200,
  setsPerSession: DEFAULT_SETS_PER_SESSION,
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
  muscleVolumes: DEFAULT_MUSCLE_VOLUMES,
  liftSessions: DEFAULT_LIFT_SESSIONS,
  fatiguePercent: DEFAULT_RTS.loadDropPercent ?? 5,
  daysPerWeek: DEFAULT_DAYS_PER_WEEK,
  weeksBeforeDeload: DEFAULT_WEEKS_BEFORE_DELOAD,
  phase: 'maintain',
  // Deliberately unset: a default calorie target would be a guess
  // presented as a decision the lifter had made.
  phaseRate: PHASE_RATES.maintain,
  e1rmFormula: 'epley',
  restTimerEnabled: true,
  keepScreenAwake: true,
  checkInsEnabled: true,
  theme: 'system',
  jobSearch: EMPTY_JOB_SEARCH,
  digest: DEFAULT_DIGEST,
  homeWants: DEFAULT_WANTS,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
}

/** Days since the last export before the app starts asking. */
export const BACKUP_REMINDER_DAYS = 14
/** Workouts logged since the last export before the app starts asking. */
export const BACKUP_REMINDER_WORKOUTS = 10

export interface BackupStatus {
  readonly shouldRemind: boolean
  readonly daysSinceExport?: number
  readonly workoutsSinceExport: number
  readonly reason: string
}

export function backupStatus(
  settings: AppSettings,
  workoutsSinceExport: number,
  now: Date,
): BackupStatus {
  if (settings.lastExportAt === undefined) {
    return {
      shouldRemind: workoutsSinceExport > 0,
      workoutsSinceExport,
      reason:
        workoutsSinceExport > 0
          ? 'You have never exported a backup. This data exists only on this device.'
          : 'Nothing to back up yet.',
    }
  }

  const days = Math.floor(
    (now.getTime() - new Date(settings.lastExportAt).getTime()) / (1000 * 60 * 60 * 24),
  )

  if (days >= BACKUP_REMINDER_DAYS) {
    return {
      shouldRemind: true,
      daysSinceExport: days,
      workoutsSinceExport,
      reason: `It has been ${String(days)} days since your last backup.`,
    }
  }

  if (workoutsSinceExport >= BACKUP_REMINDER_WORKOUTS) {
    return {
      shouldRemind: true,
      daysSinceExport: days,
      workoutsSinceExport,
      reason: `You have logged ${String(workoutsSinceExport)} workouts since your last backup.`,
    }
  }

  return {
    shouldRemind: false,
    daysSinceExport: days,
    workoutsSinceExport,
    reason: 'Your backup is recent.',
  }
}
