import { STORAGE_KEYS } from '@/config/storage-keys'
import type { SweepMarker, SweepMarkerStore } from '@/application/use-cases/jobs/daily-sweep'

/**
 * The local day the job boards were last read automatically.
 *
 * Device-local and never synced, which is the same call the upgrade
 * budget and the program position make. A marker that travelled would
 * have the phone skip its morning sweep because the laptop ran one an
 * hour ago — leaving the phone showing nothing with no way to say why.
 * Two devices each reading a board is the cheaper mistake, and it is a
 * handful of requests.
 *
 * Absent when unreadable, which fails towards sweeping rather than away
 * from it: a blocked storage means the boards are read on every open,
 * which is wasteful and visible, where the opposite is silent.
 */
export function createSweepMarkerStore(storage: Storage = localStorage): SweepMarkerStore {
  return {
    get(): SweepMarker {
      try {
        const raw = storage.getItem(STORAGE_KEYS.jobSweptOn)

        // A day key and nothing else. Anything of another shape is
        // treated as absent rather than compared against today, or a
        // hand-edited value could pin the sweep off forever.
        return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? { sweptOn: raw } : {}
      } catch {
        return {}
      }
    },

    save(marker: SweepMarker) {
      try {
        if (marker.sweptOn === undefined) storage.removeItem(STORAGE_KEYS.jobSweptOn)
        else storage.setItem(STORAGE_KEYS.jobSweptOn, marker.sweptOn)
      } catch {
        // A blocked quota costs a duplicate sweep, not data.
      }
    },
  }
}
