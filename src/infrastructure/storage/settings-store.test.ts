import { beforeEach, describe, expect, it } from 'vitest'

import { STORAGE_KEYS } from '@/config/storage-keys'
import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { readSettings, writeSettings } from './settings-store'

/**
 * When the stamp moves, and when it must not.
 *
 * Tested here rather than through the sync, because this is where the
 * decision is made — a sync test using an in-memory settings double
 * bypasses `writeSettings` entirely and passes whatever the double was
 * handed. The first attempt did exactly that and proved nothing.
 */

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: () => {
      map.clear()
    },
    key: () => null,
    get length() {
      return map.size
    },
  }
}

let storage: Storage
const at = (iso: string) => () => new Date(iso)
const NOW = '2026-08-26T09:00:00.000Z'

beforeEach(() => {
  storage = memoryStorage()
})

describe('stamping settings on write', () => {
  it('stamps when something that travels changes', () => {
    writeSettings(DEFAULT_SETTINGS, storage, at('2026-08-26T09:00:00.000Z'))
    writeSettings({ ...DEFAULT_SETTINGS, daysPerWeek: 3 }, storage, at('2026-08-26T10:00:00.000Z'))

    expect(readSettings(storage).settings.updatedAt).toBe('2026-08-26T10:00:00.000Z')
  })

  it('leaves the stamp alone when only a device preference changes', () => {
    /*
     * The bug this replaces. Push runs before pull, so stamping every save
     * made a dark-mode toggle the newest copy of the *shared* settings —
     * and it then pushed its untouched values over a reminder change the
     * other device had genuinely made. A theme switch reverting someone
     * else's edit is about as quiet as a failure gets.
     */
    writeSettings(DEFAULT_SETTINGS, storage, at('2026-08-26T09:00:00.000Z'))
    writeSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, storage, at('2026-08-26T10:00:00.000Z'))

    const after = readSettings(storage).settings
    expect(after.theme).toBe('dark')
    expect(after.updatedAt).toBe('2026-08-26T09:00:00.000Z')
  })

  it('stamps the first write, which has nothing to compare against', () => {
    writeSettings({ ...DEFAULT_SETTINGS, theme: 'dark' }, storage, at('2026-08-26T09:00:00.000Z'))

    expect(readSettings(storage).settings.updatedAt).toBe('2026-08-26T09:00:00.000Z')
  })
})

describe('the exploration region', () => {
  /*
   * This parse builds its result field by field, which is what makes an
   * unknown blob safe — and also means a field added to the type without
   * being added here is silently dropped. `updatedAt` was once, and so was
   * this: the region saved fine, came back absent, and the ladder read
   * "nothing measured" against a number sitting in storage the whole time.
   */
  it('survives a round trip', () => {
    writeSettings({ ...DEFAULT_SETTINGS, exploredRegionKm2: 1572 }, storage, at(NOW))

    expect(readSettings(storage).settings.exploredRegionKm2).toBe(1572)
  })

  it('is absent when nothing was stored', () => {
    writeSettings(DEFAULT_SETTINGS, storage, at(NOW))

    expect(readSettings(storage).settings.exploredRegionKm2).toBeUndefined()
  })

  /*
   * Zero would divide. Absent is what tells the ladder to say nothing at
   * all, so a stored zero has to degrade to absent rather than be carried
   * through as a number — and a hand-edited or synced blob can hold one
   * even though the settings field refuses it.
   */
  it('degrades a zero or a negative to absent rather than carrying it', () => {
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ exploredRegionKm2: 0 }))
    expect(readSettings(storage).settings.exploredRegionKm2).toBeUndefined()

    storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ exploredRegionKm2: -5 }))
    expect(readSettings(storage).settings.exploredRegionKm2).toBeUndefined()
  })

  it('ignores something that is not a number at all', () => {
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ exploredRegionKm2: '1572' }))

    expect(readSettings(storage).settings.exploredRegionKm2).toBeUndefined()
  })
})

/**
 * A shipped change to the defaults has to be able to reach a device that
 * has already saved a copy of the old ones.
 *
 * The gap this closes: settings are persisted on first run, so the store
 * cannot tell a value the lifter chose from a default it saved on their
 * behalf. `completeLiftSessions` correctly refuses to overwrite either —
 * which meant the overhead press arrived and nobody who had ever opened
 * the app saw it, because their stored `liftSessions` had `bench: 2` and
 * no `press` key.
 */
describe('re-seeding a setting whose meaning changed', () => {
  const storedAs = (liftSessions: unknown, schemaVersion: number): void => {
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ ...DEFAULT_SETTINGS, liftSessions, schemaVersion }),
    )
  }

  it('replaces lift sessions written before the fourth lift existed', () => {
    storedAs({ squat: 2, bench: 2, deadlift: 2 }, 1)

    expect(readSettings(storage).settings.liftSessions).toEqual(DEFAULT_SETTINGS.liftSessions)
  })

  it('treats a copy with no version at all as older still', () => {
    // `DEFAULT_SETTINGS` carries the current version, so it has to be
    // taken back out — a copy written before the field existed has none.
    const { schemaVersion: _dropped, ...withoutVersion } = DEFAULT_SETTINGS

    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ ...withoutVersion, liftSessions: { squat: 2, bench: 2, deadlift: 2 } }),
    )

    expect(readSettings(storage).settings.liftSessions).toEqual(DEFAULT_SETTINGS.liftSessions)
  })

  /*
   * And it is a one-time re-seed, not a rule that the defaults always
   * win. A choice made *after* the change is the lifter's and stays.
   */
  it('keeps a choice made since the change', () => {
    storedAs({ squat: 3, bench: 2, deadlift: 1, press: 2 }, 2)

    expect(readSettings(storage).settings.liftSessions).toEqual({
      squat: 3,
      bench: 2,
      deadlift: 1,
      press: 2,
    })
  })

  it('fills a missing lift rather than resetting everything, once current', () => {
    storedAs({ squat: 3, bench: 2, deadlift: 1 }, 2)

    const read = readSettings(storage).settings.liftSessions

    expect(read.squat).toBe(3)
    expect(read.press).toBe(DEFAULT_SETTINGS.liftSessions.press)
  })
})
