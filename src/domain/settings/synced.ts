import type { AppSettings } from '@/domain/settings/settings'

/**
 * Which settings belong to the lifter and which belong to the device.
 *
 * The distinction is not cosmetic. The program is *derived* from settings
 * on every read, so two devices holding different tiers derive genuinely
 * different programs — you would sync a session logged against a Tuesday
 * your other device does not show. Syncing history without syncing the
 * priorities that produced it is the half that looks like it works.
 *
 * The other half must not travel. Whether the rest timer runs, whether
 * the screen stays awake, which theme — those are answers about the
 * device you are holding, and two devices legitimately disagree. Sending
 * them would clobber a preference set deliberately on one, which is the
 * same reason the program *position* stays local.
 *
 * Projected rather than nested, deliberately. Splitting `AppSettings`
 * into `training` and `device` objects would touch every read in the app
 * — `settings.units` becoming `settings.training.units` in a hundred
 * places — to express something only the sync cares about. A list of keys
 * says the same thing and costs nothing at the call sites.
 */

export const SYNCED_SETTING_KEYS = [
  'units',
  'roundingIncrement',
  'bodyweight',
  'landmarks',
  'estimatedMaxes',
  'excludedExercises',
  'muscleTiers',
  'strengthTiers',
  'daysPerWeek',
  'weeksBeforeDeload',
  'e1rmFormula',
] as const

export type SyncedSettingKey = (typeof SYNCED_SETTING_KEYS)[number]

/**
 * The travelling half, with the stamp that lets two copies be ordered.
 *
 * `updatedAt` is on the settings blob rather than on each field. Nobody
 * edits their tiers on two devices at once, so per-field merge would be
 * machinery guarding a case that does not arise — and a half-merged
 * settings object is a worse outcome than an older one, because the
 * program it derives would match neither device.
 */
export type SyncedSettings = Pick<AppSettings, SyncedSettingKey> & {
  readonly updatedAt?: string
}

export function projectForSync(settings: AppSettings): SyncedSettings {
  const projected: Record<string, unknown> = {}

  for (const key of SYNCED_SETTING_KEYS) {
    // Skipped rather than written as undefined: `bodyweight` is optional,
    // and under `exactOptionalPropertyTypes` an absent field and one
    // explicitly undefined are different things. Firestore also refuses
    // undefined outright.
    const value = settings[key]
    if (value !== undefined) projected[key] = value
  }

  if (settings.updatedAt !== undefined) projected.updatedAt = settings.updatedAt

  return projected as SyncedSettings
}

/**
 * Takes the incoming settings only if they are newer.
 *
 * Returns the local object unchanged when they are not, so a caller can
 * tell "nothing to do" by identity and avoid a write that would restamp
 * and re-sync the same values forever.
 *
 * Local wins a tie. The two stamps being equal to the millisecond means
 * they almost certainly describe the same save, and preferring the remote
 * copy would rewrite a device's settings with a byte-identical version
 * for no reason.
 *
 * Incoming settings with no stamp are refused. They cannot prove they are
 * newer, which is the same rule tombstones and records already follow —
 * and here it also excludes anything written before settings could be
 * stamped at all.
 */
export function mergeSettings(local: AppSettings, incoming: SyncedSettings): AppSettings {
  if (incoming.updatedAt === undefined) return local
  if (local.updatedAt !== undefined && local.updatedAt >= incoming.updatedAt) return local

  const merged: Record<string, unknown> = { ...local }

  for (const key of SYNCED_SETTING_KEYS) {
    const value = incoming[key]
    if (value !== undefined) merged[key] = value
  }

  merged.updatedAt = incoming.updatedAt

  // Built by spreading a complete AppSettings and overwriting known
  // keys, so the shape is intact; the cast is about the index signature
  // the loop needed, not about a claim the compiler cannot check.
  return merged as unknown as AppSettings
}
