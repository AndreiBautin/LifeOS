import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS, type AppSettings } from './settings'
import { mergeSettings, projectForSync, SYNCED_SETTING_KEYS } from './synced'

/**
 * The split these guard is the difference between syncing a lifter's
 * history and syncing their training. The program is derived from
 * settings, so two devices holding different tiers derive different
 * programs from identical history.
 */

const at = (updatedAt: string, over: Partial<AppSettings> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  updatedAt,
  ...over,
})

describe('what travels', () => {
  it('sends the settings the program is derived from', () => {
    const projected = projectForSync(at('2026-08-25T09:00:00.000Z'))

    for (const key of [
      'muscleVolumes',
      'liftSessions',
      'setsPerSession',
      // 'fatiguePercent' was here and went with RTS: the programme is no
      // longer derived from it, so sending it would be syncing a setting
      // nothing reads.
      'daysPerWeek',
    ] as const) {
      expect(projected, key).toHaveProperty(key)
    }
  })

  it('keeps device preferences off the wire', () => {
    /*
     * Two devices legitimately disagree about these, and sending them
     * would clobber a choice made deliberately on one — the same reason
     * the program position stays local.
     */
    const projected = projectForSync(at('2026-08-25T09:00:00.000Z')) as Record<string, unknown>

    for (const key of ['theme', 'keepScreenAwake', 'restTimerEnabled', 'lastExportAt']) {
      expect(projected, key).not.toHaveProperty(key)
    }
  })

  it('omits an absent optional rather than sending undefined', () => {
    // Firestore refuses undefined outright, and under
    // `exactOptionalPropertyTypes` an absent field and an explicitly
    // undefined one are different things.
    const { bodyweight: _dropped, ...withoutBodyweight } = at('2026-08-25T09:00:00.000Z')
    const projected = projectForSync(withoutBodyweight)

    expect('bodyweight' in projected).toBe(false)
  })
})

describe('merging two copies', () => {
  const local = at('2026-08-25T09:00:00.000Z', { daysPerWeek: 5 })

  it('takes the newer copy', () => {
    const merged = mergeSettings(
      local,
      projectForSync(at('2026-08-25T11:00:00.000Z', { daysPerWeek: 4 })),
    )

    expect(merged.daysPerWeek).toBe(4)
    expect(merged.updatedAt).toBe('2026-08-25T11:00:00.000Z')
  })

  it('refuses an older copy, by identity', () => {
    /*
     * Identity, not equality. The caller skips the write when nothing
     * moved — and writing would restamp the values, making this device the
     * newest and bouncing the same settings back on the next exchange
     * forever.
     */
    const merged = mergeSettings(local, projectForSync(at('2026-08-25T08:00:00.000Z')))

    expect(merged).toBe(local)
  })

  it('keeps the local copy on a tie', () => {
    // Equal to the millisecond almost certainly means the same save, and
    // preferring the remote would rewrite a device's settings with a
    // byte-identical version for nothing.
    expect(mergeSettings(local, projectForSync(at('2026-08-25T09:00:00.000Z')))).toBe(local)
  })

  it('refuses a copy that cannot say when it changed', () => {
    // Settings written before they could be stamped. The same rule
    // records and tombstones follow: no proof of being newer, no win.
    const { updatedAt: _none, ...unstamped } = projectForSync(at('2026-08-25T11:00:00.000Z'))

    expect(mergeSettings(local, unstamped)).toBe(local)
  })

  it('leaves device preferences untouched when it accepts', () => {
    const localWithPrefs = at('2026-08-25T09:00:00.000Z', { theme: 'dark', keepScreenAwake: true })
    const incoming = projectForSync(at('2026-08-25T11:00:00.000Z', { daysPerWeek: 3 }))

    const merged = mergeSettings(localWithPrefs, incoming)

    expect(merged.daysPerWeek).toBe(3)
    expect(merged.theme).toBe('dark')
    expect(merged.keepScreenAwake).toBe(true)
  })

  it('carries every synced key it was given', () => {
    // Guards the loop against a key being added to the list and silently
    // never applied.
    const incoming = projectForSync(at('2026-08-25T11:00:00.000Z', { daysPerWeek: 3, units: 'kg' }))
    const merged = mergeSettings(local, incoming) as unknown as Record<string, unknown>

    for (const key of SYNCED_SETTING_KEYS) {
      if (incoming[key] === undefined) continue
      expect(merged[key], key).toEqual(incoming[key])
    }
  })
})
