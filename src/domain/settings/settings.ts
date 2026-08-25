import type { ExerciseId } from '@/domain/ids/ids'
import type { E1rmFormula } from '@/domain/strength/one-rep-max'
import type { WeightUnit } from '@/domain/units/weight'
import type { MuscleTiers, StrengthTiers } from '@/domain/priority/tiers'
import { DEFAULT_MUSCLE_TIERS, DEFAULT_STRENGTH_TIERS } from '@/domain/priority/tiers'
import type { LandmarkSet } from '@/domain/volume/landmarks'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'
import { DEFAULT_WEEKS_BEFORE_DELOAD } from '@/domain/autoregulation/schedule'

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
  readonly trainingMaxes: Readonly<Partial<Record<ExerciseId, number>>>
  readonly landmarks: LandmarkSet

  /**
   * What the lifter is prioritising, which drives where inside each
   * landmark band a muscle's weekly target lands.
   */
  readonly muscleTiers: MuscleTiers
  readonly strengthTiers: StrengthTiers

  /**
   * Days per week and weeks per block.
   *
   * Both are autoregulated — session length moves the first, block
   * performance the second — so these are the *current* values rather
   * than fixed preferences, and the app writes back to them.
   */
  readonly daysPerWeek: number
  readonly weeksBeforeDeload: number
  /** Roughly how long a session should run, in minutes. */
  readonly targetSessionMinutes: number
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
  trainingMaxes: {},
  landmarks: DEFAULT_LANDMARKS,
  muscleTiers: DEFAULT_MUSCLE_TIERS,
  strengthTiers: DEFAULT_STRENGTH_TIERS,
  daysPerWeek: 4,
  weeksBeforeDeload: DEFAULT_WEEKS_BEFORE_DELOAD,
  targetSessionMinutes: 70,
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
