import {
  applyBacklogSettingsChanges,
  DEFAULT_BACKLOG_SETTINGS,
  type BacklogSettings,
} from '@/domain/backlog/settings'
import type { BacklogSettingsRepository } from '@/domain/repositories/ports'

import { STORAGE_KEYS } from '@/config/storage-keys'

/**
 * The backlog's preferences, in localStorage beside the training ones.
 *
 * Four short strings that are read on every list render and written when
 * somebody changes a dropdown — the shape localStorage is actually good
 * at, and the same reasoning that keeps `AppSettings` out of IndexedDB. A
 * corrupted database should not take a default sort order with it.
 *
 * Reading never fails. Anything unparseable, or holding a value no longer
 * in a registry, degrades to the documented default rather than throwing
 * on the first render of the page — which is what a hand-edited key or a
 * removed category would otherwise do.
 */
export function readBacklogSettings(storage: Storage = localStorage): BacklogSettings {
  let raw: string | null

  try {
    raw = storage.getItem(STORAGE_KEYS.backlogSettings)
  } catch {
    return DEFAULT_BACKLOG_SETTINGS
  }

  if (raw === null) return DEFAULT_BACKLOG_SETTINGS

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_BACKLOG_SETTINGS
  }

  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BACKLOG_SETTINGS

  /*
   * Each field is offered to the validator on its own, and a field that is
   * refused falls back rather than taking the other three with it. A
   * category removed from the registry between releases is exactly this
   * case: the sort order stored beside it is still perfectly good.
   */
  const candidate = parsed as Record<string, unknown>

  return (['defaultSort', 'defaultCategory', 'defaultStatus'] as const).reduce(
    (settings, field) => {
      const value = candidate[field]
      if (typeof value !== 'string') return settings

      try {
        return applyBacklogSettingsChanges(settings, { [field]: value })
      } catch {
        return settings
      }
    },
    DEFAULT_BACKLOG_SETTINGS,
  )
}

export function writeBacklogSettings(
  settings: BacklogSettings,
  storage: Storage = localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEYS.backlogSettings, JSON.stringify(settings))
  } catch {
    // A full or blocked quota loses a preference, not a backlog. The
    // items are in IndexedDB; there is nothing here worth failing a
    // render over.
  }
}

export function createBacklogSettingsStore(
  storage: Storage = localStorage,
): BacklogSettingsRepository {
  return {
    get() {
      return Promise.resolve(readBacklogSettings(storage))
    },
    save(settings: BacklogSettings) {
      writeBacklogSettings(settings, storage)
      return Promise.resolve()
    },
  }
}
