import { asExerciseId } from '@/domain/ids/ids'
import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings/settings'

import { STORAGE_KEYS } from '@/config/storage-keys'

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

beforeEach(() => {
  storage = memoryStorage()
})

describe('stamping settings on write', () => {
  it('stamps when something that travels changes', () => {
    writeSettings(DEFAULT_SETTINGS, storage, at('2026-08-26T09:00:00.000Z'))
    writeSettings(
      { ...DEFAULT_SETTINGS, excludedExercises: [asExerciseId('dips')] },
      storage,
      at('2026-08-26T10:00:00.000Z'),
    )

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

describe('the plates to hand', () => {
  /*
   * The parse builds field by field, so a new setting left out of it is
   * written and silently dropped on the way back in — the trap that has
   * caught two fields here already.
   */
  it('survives a write and a read, with junk dropped', () => {
    writeSettings(
      { ...DEFAULT_SETTINGS, plates: [45, 25, 10] },
      storage,
      at('2026-08-26T09:00:00Z'),
    )
    expect(readSettings(storage).settings.plates).toEqual([45, 25, 10])

    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ ...DEFAULT_SETTINGS, plates: [45, 'x', -5, 10] }),
    )
    expect(readSettings(storage).settings.plates).toEqual([45, 10])
  })

  it('is absent when never set', () => {
    writeSettings(DEFAULT_SETTINGS, storage, at('2026-08-26T09:00:00Z'))
    expect(readSettings(storage).settings.plates).toBeUndefined()
  })
})

describe('the first-run setup', () => {
  it('stays done across a write and a read', () => {
    writeSettings({ ...DEFAULT_SETTINGS, setupDone: true }, storage, at('2026-08-26T09:00:00Z'))
    expect(readSettings(storage).settings.setupDone).toBe(true)
  })

  it('remembers that a set has been swiped', () => {
    writeSettings({ ...DEFAULT_SETTINGS, swipeLearned: true }, storage, at('2026-08-26T09:00:00Z'))
    expect(readSettings(storage).settings.swipeLearned).toBe(true)
  })
})

describe('accepted resets', () => {
  it('survive a write and a read, with malformed ones dropped', () => {
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        loadResets: {
          'bench-press': { load: 200, at: '2026-09-01T10:00:00.000Z' },
          squat: { load: -5, at: '2026-09-01T10:00:00.000Z' },
          deadlift: { load: 300, at: 'yesterday' },
        },
      }),
    )
    expect(readSettings(storage).settings.loadResets).toEqual({
      'bench-press': { load: 200, at: '2026-09-01T10:00:00.000Z' },
    })
  })

  it('keeps lift goals that make sense and drops the rest', () => {
    const storage = memoryStorage()
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        liftGoals: {
          bench: { load: 275, by: '2027-03-01', setOn: '2026-10-02', from: 240 },
          squat: { load: 0, by: '2027-03-01', setOn: '2026-10-02', from: 300 },
          press: { load: 150, by: '2027-03-01', setOn: '2026-10-02', from: 120 },
        },
      }),
    )
    expect(readSettings(storage).settings.liftGoals).toEqual({
      bench: { load: 275, by: '2027-03-01', setOn: '2026-10-02', from: 240 },
    })
  })

  it('keeps an accent on offer and drops any other hue', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, accentHue: 235 }))
    expect(readSettings(storage).settings.accentHue).toBe(235)
    storage.setItem(STORAGE_KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, accentHue: 150 }))
    expect(readSettings(storage).settings.accentHue).toBeUndefined()
  })

  it('keeps each exercise cue as a trimmed line and drops blanks', () => {
    const storage = memoryStorage()
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        exerciseCues: { 'bench-press': '  elbows under the bar ', squat: '   ', deadlift: 4 },
      }),
    )
    expect(readSettings(storage).settings.exerciseCues).toEqual({
      'bench-press': 'elbows under the bar',
    })
  })

  it('keeps which release note was seen', () => {
    const storage = memoryStorage()
    storage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ ...DEFAULT_SETTINGS, seenNotes: '2026-10-03' }),
    )
    expect(readSettings(storage).settings.seenNotes).toBe('2026-10-03')
  })
})
