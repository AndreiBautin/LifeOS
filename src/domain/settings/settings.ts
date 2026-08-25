import { asExerciseId, type ExerciseId } from '@/domain/ids/ids'
import type { E1rmFormula } from '@/domain/strength/one-rep-max'
import type { WeightUnit } from '@/domain/units/weight'
import type { MuscleTiers, StrengthTiers } from '@/domain/priority/tiers'
import { DEFAULT_MUSCLE_TIERS, DEFAULT_STRENGTH_TIERS } from '@/domain/priority/tiers'
import type { LandmarkSet } from '@/domain/volume/landmarks'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'
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
  readonly landmarks: LandmarkSet

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
   * What the lifter is prioritising, which drives where inside each
   * landmark band a muscle's weekly target lands.
   */
  readonly muscleTiers: MuscleTiers
  readonly strengthTiers: StrengthTiers

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
  readonly theme: 'system' | 'light' | 'dark'
  /**
   * ISO timestamp of the last successful export. Drives the backup
   * reminder — a backup feature nobody is prompted to use is worth
   * nothing, and this is local-only storage.
   */
  readonly lastExportAt?: string
  readonly schemaVersion: number
}

export const SETTINGS_SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: AppSettings = {
  units: 'lb',
  roundingIncrement: 5,
  // From the same 5/3/1 export. Needed as well as the maxes: every
  // strength standard is a multiple of bodyweight, so without it the
  // character sheet can only say "set your bodyweight".
  bodyweight: 200,
  landmarks: DEFAULT_LANDMARKS,
  // Read out of the 5/3/1 export, each from the best completed work set
  // in it: 260x5, 195x5, 315x5 and 130x5. A starting point for the RTS
  // suggestions, not a claim — the top set corrects them the first time
  // each lift is trained.
  estimatedMaxes: {
    [asExerciseId('low-bar-squat')]: 303,
    [asExerciseId('bench-press')]: 228,
    [asExerciseId('sumo-deadlift')]: 368,
    [asExerciseId('overhead-press')]: 152,
  },
  excludedExercises: [],
  muscleTiers: DEFAULT_MUSCLE_TIERS,
  strengthTiers: DEFAULT_STRENGTH_TIERS,
  daysPerWeek: DEFAULT_DAYS_PER_WEEK,
  weeksBeforeDeload: DEFAULT_WEEKS_BEFORE_DELOAD,
  e1rmFormula: 'epley',
  restTimerEnabled: true,
  keepScreenAwake: true,
  checkInsEnabled: true,
  theme: 'system',
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
