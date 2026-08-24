import type { AppSettings } from '@/domain/settings/settings'
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '@/domain/settings/settings'
import { STORAGE_KEYS } from '@/config/storage-keys'

/**
 * Settings live in localStorage, deliberately, while everything else
 * lives in IndexedDB.
 *
 * The split is not arbitrary. Settings are small, always read together,
 * and read synchronously at startup before anything can be rendered —
 * localStorage is genuinely the right tool for that shape. More
 * importantly, keeping them in a different store means a corrupted or
 * rebuilt IndexedDB does not take a lifter's training maxes and volume
 * landmarks with it. Losing your history is bad; losing your history
 * *and* every number needed to resume training is worse.
 *
 * Reading is total: a malformed value degrades to the default and reports
 * a warning rather than throwing at startup, because a settings blob that
 * cannot be parsed must not be able to prevent the app from opening.
 */

export interface SettingsReadResult {
  readonly settings: AppSettings
  readonly recovered: boolean
  readonly warning?: string
}

export function readSettings(storage: Storage = localStorage): SettingsReadResult {
  let raw: string | null

  try {
    raw = storage.getItem(STORAGE_KEYS.settings)
  } catch {
    // Private browsing in some engines throws on access rather than
    // returning null. The app still works; it just cannot remember.
    return {
      settings: DEFAULT_SETTINGS,
      recovered: true,
      warning: 'Local storage is unavailable, so settings will not persist between sessions.',
    }
  }

  if (raw === null) return { settings: DEFAULT_SETTINGS, recovered: false }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      settings: DEFAULT_SETTINGS,
      recovered: true,
      warning: 'Saved settings could not be read and have been reset to defaults.',
    }
  }

  return { settings: mergeWithDefaults(parsed), recovered: false }
}

export function writeSettings(settings: AppSettings, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
    return true
  } catch {
    // Quota exhausted, or storage disabled. Reported rather than thrown:
    // failing to save a preference must not interrupt a workout.
    return false
  }
}

/**
 * Fills in anything a stored blob is missing.
 *
 * An older version's settings are missing whatever has been added since,
 * and a hand-edited file may be missing anything at all. Merging rather
 * than validating means an upgrade never loses a setting that is still
 * valid, and a corrupt field falls back to its default in isolation
 * instead of discarding the whole record.
 */
function mergeWithDefaults(parsed: unknown): AppSettings {
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS

  // Read as an untyped bag: this value came off disk and may be from an
  // older version, a hand-edited file, or something else entirely.
  // Declaring it `Partial<AppSettings>` would tell the compiler that
  // fields which can genuinely be null cannot be.
  const stored = parsed as Record<string, unknown>

  return {
    units: stored.units === 'kg' || stored.units === 'lb' ? stored.units : DEFAULT_SETTINGS.units,
    roundingIncrement:
      typeof stored.roundingIncrement === 'number' && stored.roundingIncrement > 0
        ? stored.roundingIncrement
        : DEFAULT_SETTINGS.roundingIncrement,
    ...(typeof stored.bodyweight === 'number' && stored.bodyweight > 0
      ? { bodyweight: stored.bodyweight }
      : {}),
    trainingMaxes: isRecord(stored.trainingMaxes)
      ? (stored.trainingMaxes as AppSettings['trainingMaxes'])
      : DEFAULT_SETTINGS.trainingMaxes,
    // Spread over the defaults so a muscle group added since this blob was
    // written gets its default landmarks rather than being absent.
    landmarks: isRecord(stored.landmarks)
      ? { ...DEFAULT_SETTINGS.landmarks, ...(stored.landmarks as AppSettings['landmarks']) }
      : DEFAULT_SETTINGS.landmarks,
    e1rmFormula:
      stored.e1rmFormula === 'epley' ||
      stored.e1rmFormula === 'brzycki' ||
      stored.e1rmFormula === 'lombardi'
        ? stored.e1rmFormula
        : DEFAULT_SETTINGS.e1rmFormula,
    restTimerEnabled: asBoolean(stored.restTimerEnabled, DEFAULT_SETTINGS.restTimerEnabled),
    keepScreenAwake: asBoolean(stored.keepScreenAwake, DEFAULT_SETTINGS.keepScreenAwake),
    checkInsEnabled: asBoolean(stored.checkInsEnabled, DEFAULT_SETTINGS.checkInsEnabled),
    theme:
      stored.theme === 'light' || stored.theme === 'dark' || stored.theme === 'system'
        ? stored.theme
        : DEFAULT_SETTINGS.theme,
    ...(typeof stored.lastExportAt === 'string' ? { lastExportAt: stored.lastExportAt } : {}),
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
