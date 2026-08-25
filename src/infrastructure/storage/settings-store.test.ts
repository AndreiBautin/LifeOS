import { describe, expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '@/domain/settings/settings'
import { STORAGE_KEYS } from '@/config/storage-keys'

import { readSettings, writeSettings } from './settings-store'

/**
 * Merging a stored blob with the defaults.
 *
 * The bugs this guards against are all the same shape and all invisible:
 * a field that fails to fall back leaves the app running normally with a
 * value nobody chose. Two shipped — an empty `estimatedMaxes` shadowing
 * the seeded ones, and a missing `bodyweight` being dropped instead of
 * defaulted, which made every strength standard report "set your
 * bodyweight" on an install that had one.
 */

function memoryStorage(seed?: unknown): Storage {
  const map = new Map<string, string>()
  if (seed !== undefined) map.set(STORAGE_KEYS.settings, JSON.stringify(seed))

  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
    clear: () => {
      map.clear()
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

describe('falling back to the defaults', () => {
  it('uses the seeded maxes when the stored record is empty', () => {
    // An earlier version wrote `{}` on first run. Treating that as a
    // deliberate choice permanently shadowed the seeded maxes.
    const { settings } = readSettings(memoryStorage({ estimatedMaxes: {} }))

    expect(settings.estimatedMaxes).toEqual(DEFAULT_SETTINGS.estimatedMaxes)
    expect(Object.keys(settings.estimatedMaxes).length).toBeGreaterThan(0)
  })

  it('keeps stored maxes when there are any', () => {
    const { settings } = readSettings(memoryStorage({ estimatedMaxes: { 'bench-press': 250 } }))

    expect(settings.estimatedMaxes).toEqual({ 'bench-press': 250 })
  })

  it('uses the default bodyweight when none is stored', () => {
    const { settings } = readSettings(memoryStorage({ units: 'lb' }))

    expect(settings.bodyweight).toBe(DEFAULT_SETTINGS.bodyweight)
  })

  it('keeps a stored bodyweight', () => {
    const { settings } = readSettings(memoryStorage({ bodyweight: 176 }))

    expect(settings.bodyweight).toBe(176)
  })

  it('rejects a nonsensical bodyweight rather than carrying it', () => {
    for (const junk of [0, -5, 'heavy', null]) {
      const { settings } = readSettings(memoryStorage({ bodyweight: junk }))
      expect(settings.bodyweight, JSON.stringify(junk)).toBe(DEFAULT_SETTINGS.bodyweight)
    }
  })

  it('drops a junk entry from the maxes without discarding the rest', () => {
    // A bad value here becomes a suggested load on a bar.
    const { settings } = readSettings(
      memoryStorage({ estimatedMaxes: { 'bench-press': 250, squat: 'heavy', deadlift: -1 } }),
    )

    expect(settings.estimatedMaxes).toEqual({ 'bench-press': 250 })
  })
})

describe('reading a blob that cannot be trusted', () => {
  it('recovers from unparseable JSON instead of failing to start', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEYS.settings, '{not json')

    const result = readSettings(storage)

    expect(result.recovered).toBe(true)
    expect(result.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('survives storage that throws on read', () => {
    const throwing = Object.assign(memoryStorage(), {
      getItem: () => {
        throw new Error('private mode')
      },
    })

    const result = readSettings(throwing)

    expect(result.recovered).toBe(true)
    expect(result.warning).toMatch(/not persist/i)
  })

  it('reports rather than throws when a write fails', () => {
    const throwing = Object.assign(memoryStorage(), {
      setItem: () => {
        throw new Error('quota')
      },
    })

    // Failing to save a preference must not interrupt a workout.
    expect(writeSettings(DEFAULT_SETTINGS, throwing)).toBe(false)
  })
})

describe('round-tripping', () => {
  it('preserves everything it wrote', () => {
    const storage = memoryStorage()
    writeSettings({ ...DEFAULT_SETTINGS, bodyweight: 199, daysPerWeek: 4 }, storage)

    const { settings } = readSettings(storage)

    expect(settings.bodyweight).toBe(199)
    expect(settings.daysPerWeek).toBe(4)
  })
})
