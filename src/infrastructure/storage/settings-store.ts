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
    /*
     * Falls back to the default rather than being dropped.
     *
     * Written as a conditional spread, an absent stored value produced a
     * settings object with no bodyweight at all — so the default could
     * never apply, and every strength standard (all of which are
     * multiples of bodyweight) reported "set your bodyweight" on an
     * install that had one waiting in the defaults.
     */
    ...bodyweightOf(stored.bodyweight),
    // Spread over the defaults so a muscle group added since this blob was
    // written gets its default landmarks rather than being absent.
    landmarks: isRecord(stored.landmarks)
      ? { ...DEFAULT_SETTINGS.landmarks, ...(stored.landmarks as AppSettings['landmarks']) }
      : DEFAULT_SETTINGS.landmarks,
    // Every value is checked rather than the record being trusted whole: a
    // junk entry here becomes a suggested load on a bar.
    //
    // An *empty* stored record falls back to the defaults rather than
    // winning. It is indistinguishable from never having set one, and an
    // earlier version wrote `{}` on first run — which then permanently
    // shadowed the seeded maxes for anyone who had already opened the app.
    estimatedMaxes: hasEntries(stored.estimatedMaxes)
      ? Object.fromEntries(
          Object.entries(stored.estimatedMaxes).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
          ),
        )
      : DEFAULT_SETTINGS.estimatedMaxes,
    excludedExercises: Array.isArray(stored.excludedExercises)
      ? (stored.excludedExercises as AppSettings['excludedExercises'])
      : DEFAULT_SETTINGS.excludedExercises,
    muscleTiers: Array.isArray(stored.muscleTiers)
      ? (stored.muscleTiers as AppSettings['muscleTiers'])
      : DEFAULT_SETTINGS.muscleTiers,
    strengthTiers: Array.isArray(stored.strengthTiers)
      ? (stored.strengthTiers as AppSettings['strengthTiers'])
      : DEFAULT_SETTINGS.strengthTiers,
    daysPerWeek: asBoundedNumber(stored.daysPerWeek, 2, 6, DEFAULT_SETTINGS.daysPerWeek),
    weeksBeforeDeload: asBoundedNumber(
      stored.weeksBeforeDeload,
      4,
      8,
      DEFAULT_SETTINGS.weeksBeforeDeload,
    ),
    targetSessionMinutes: asBoundedNumber(
      stored.targetSessionMinutes,
      20,
      180,
      DEFAULT_SETTINGS.targetSessionMinutes,
    ),
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

function bodyweightOf(stored: unknown): { bodyweight?: number } {
  if (typeof stored === 'number' && stored > 0) return { bodyweight: stored }
  return DEFAULT_SETTINGS.bodyweight === undefined
    ? {}
    : { bodyweight: DEFAULT_SETTINGS.bodyweight }
}

function hasEntries(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0
}

/**
 * A number that must fall inside a range, or the default.
 *
 * Clamping rather than rejecting would silently accept a nonsensical
 * stored value as a boundary one — a days-per-week of 40 becoming 6 looks
 * like a preference rather than the corruption it is.
 */
function asBoundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
