import { beforeEach, describe, expect, it } from 'vitest'

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
