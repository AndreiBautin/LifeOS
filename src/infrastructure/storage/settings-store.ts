import { parseWants } from '@/domain/homes/candidate'
import { parseDigestPreferences } from '@/domain/news/digest'
import { parseJobSearch } from '@/domain/jobs/search'
import type { AppSettings } from '@/domain/settings/settings'
import { DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '@/domain/settings/settings'
import type { SettingsRepository } from '@/domain/repositories/ports'
import { migrateBenchEstimate } from '@/domain/exercises/derived-maxes'
import { syncedPartChanged } from '@/domain/settings/synced'
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

/**
 * The one path settings take to storage, and therefore the one place
 * they are stamped.
 *
 * `now` is a parameter so a test can pin it, and because a module reading
 * the clock directly is the thing the lint rule forbids everywhere else.
 */
export function writeSettings(
  settings: AppSettings,
  storage: Storage = localStorage,
  now: () => Date = () => new Date(),
): boolean {
  try {
    /*
     * Stamped only when something that travels changed.
     *
     * The previous value is read back to compare against, which is a
     * localStorage hit on a path that already writes one — and the
     * alternative is stamping every save, which makes a theme toggle the
     * newest copy of the *shared* settings and pushes stale values over
     * another device's real edit.
     */
    const previous = readSettings(storage).settings

    /*
     * Stamp when the shared half moved, and also when there is no stamp
     * yet: an unstamped blob cannot travel at all, so leaving it that way
     * would mean settings never synced from a device whose only change
     * had been a preference.
     *
     *  answers with the defaults for empty storage rather
     * than with nothing, so the absence of a stamp is the only signal
     * that this is a first write.
     */
    const stamped: AppSettings =
      previous.updatedAt === undefined || syncedPartChanged(previous, settings)
        ? { ...settings, updatedAt: now().toISOString() }
        : // Reached only when the previous stamp exists, so it is carried
          // forward rather than re-checked.
          { ...settings, updatedAt: previous.updatedAt }
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify(stamped))
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
    /*
     * Dropped rather than defaulted, unlike the bodyweight above. There
     * is no sensible year to guess and a wrong one would put somebody on
     * a rung nothing measured — so the finance ladders stay absent until
     * this is stated.
     */
    ...positiveOf('birthYear', stored.birthYear),
    // Every value is checked rather than the record being trusted whole: a
    // junk entry here becomes a suggested load on a bar.
    //
    // An *empty* stored record falls back to the defaults rather than
    // winning. It is indistinguishable from never having set one, and an
    // earlier version wrote `{}` on first run — which then permanently
    // shadowed the seeded maxes for anyone who had already opened the app.
    /*
     * Migrated on read, so the move survives a device that has not opened
     * the settings screen since the competition bench changed. Idempotent
     * and stops the moment a paused estimate exists, so a correction is
     * never overwritten — see `migrateBenchEstimate`.
     */
    estimatedMaxes: migrateBenchEstimate(
      hasEntries(stored.estimatedMaxes)
        ? Object.fromEntries(
            Object.entries(stored.estimatedMaxes).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
            ),
          )
        : DEFAULT_SETTINGS.estimatedMaxes,
    ),
    excludedExercises: Array.isArray(stored.excludedExercises)
      ? (stored.excludedExercises as AppSettings['excludedExercises'])
      : DEFAULT_SETTINGS.excludedExercises,
    /*
     * **Four fields are simply not read any more**, and a stored blob
     * still holding them is left alone rather than cleaned: the volumes,
     * the per-lift session counts, the sets-per-level table and the
     * deload interval are constants now, and the parse builds field by
     * field, so an unknown key falls out on its own.
     *
     * That also means the way back is open. A device that has run this
     * build still holds the old values under their old names, so
     * reinstating any of them is a line here rather than a migration.
     */
    daysPerWeek: asBoundedNumber(stored.daysPerWeek, 2, 6, DEFAULT_SETTINGS.daysPerWeek),
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
    /*
     * Parsed rather than trusted, and it does its own validation because
     * it is the only nested structure in here — `parseJobSearch` drops a
     * board kind it does not recognise instead of returning a source the
     * gateway cannot read.
     */
    jobSearch: parseJobSearch(stored.jobSearch),
    digest: parseDigestPreferences(stored.digest),
    homeWants: parseWants(stored.homeWants),
    /*
     * Carried through, or the stamp is written and never read.
     *
     * This parse builds its result field by field rather than spreading,
     * which is what makes an unknown blob safe — and also means a field
     * added to the type without being added here is silently dropped.
     * `updatedAt` was, so settings were stamped on every write and came
     * back unstamped, which would have meant they never synced at all.
     */
    /*
     * The exploration ladder's denominator. Absent unless a real positive
     * number was stored: a zero would divide, and absent is what tells the
     * ladder to say nothing rather than to score against a figure nobody
     * chose.
     */
    ...(typeof stored.exploredRegionKm2 === 'number' &&
    Number.isFinite(stored.exploredRegionKm2) &&
    stored.exploredRegionKm2 > 0
      ? { exploredRegionKm2: stored.exploredRegionKm2 }
      : {}),
    /*
     * Parsed rather than spread, like every other field here — this file
     * builds its result key by key, which is what makes an unknown blob
     * safe and what has twice caught a new field vanishing on the way
     * back in.
     */
    ...(typeof stored.updatedAt === 'string' ? { updatedAt: stored.updatedAt } : {}),
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

/**
 * A positive number under its own key, or nothing at all.
 *
 * Built field by field like everything else in this parser: a spread of
 * the stored blob would carry whatever a future version wrote, and a key
 * holding `undefined` is a different type from an absent one under
 * `exactOptionalPropertyTypes`.
 */
function positiveOf<K extends string>(key: K, stored: unknown): Partial<Record<K, number>> {
  if (typeof stored === 'number' && Number.isFinite(stored) && stored > 0) {
    return { [key]: stored } as Record<K, number>
  }
  return {}
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

/**
 * The settings port, over the same localStorage blob.
 *
 * Thin on purpose: reading recovers a malformed blob to defaults and
 * writing stamps it, and both of those already live above. This exists so
 * the sync — which is in the application layer and has no business
 * knowing settings are JSON in localStorage — can reach them through a
 * port like everything else.
 */
export function createSettingsStore(
  storage: Storage = localStorage,
  now: () => Date = () => new Date(),
): SettingsRepository {
  return {
    get: () => Promise.resolve(readSettings(storage).settings),
    save: (settings) => {
      writeSettings(settings, storage, now)
      return Promise.resolve()
    },
  }
}
