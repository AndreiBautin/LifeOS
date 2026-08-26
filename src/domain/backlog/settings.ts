import { isCategoryId, type CategoryId } from './category-registry'
import { BacklogValidationError } from './errors'
import { isSortKey, type SortKey } from './sort-key'
import { isStatus, type Status } from './status'

/**
 * The backlog's own preferences — what a new item defaults to, and how the
 * list is ordered.
 *
 * Named for its area because there are now two of these. Lift's
 * `AppSettings` is tiers, landmarks and estimated maxes; this is which
 * category a new book lands in. They are not the same record and merging
 * them would put a muscle priority next to a default sort order.
 *
 * `theme` did not come across. It was a whole-app preference living in one
 * app's settings, and there is one app now — the hub owns the theme, and a
 * second copy of it would be two switches for one light.
 */
export interface BacklogSettings {
  readonly defaultSort: SortKey
  readonly defaultCategory: CategoryId
  readonly defaultStatus: Status
}

export const DEFAULT_BACKLOG_SETTINGS: BacklogSettings = {
  defaultSort: 'recently-added',
  defaultCategory: 'games',
  defaultStatus: 'backlog',
}

export interface BacklogSettingsChanges {
  defaultSort?: string
  defaultCategory?: string
  defaultStatus?: string
}

function requireSortKey(value: string): SortKey {
  if (!isSortKey(value)) {
    throw new BacklogValidationError(`Unknown sort key: ${value}`)
  }
  return value
}

function requireCategory(value: string): CategoryId {
  if (!isCategoryId(value)) {
    throw new BacklogValidationError(`Unknown category: ${value}`)
  }
  return value
}

function requireStatus(value: string): Status {
  if (!isStatus(value)) {
    throw new BacklogValidationError(`Unknown status: ${value}`)
  }
  return value
}

export function applyBacklogSettingsChanges(
  settings: BacklogSettings,
  changes: BacklogSettingsChanges,
): BacklogSettings {
  return {
    defaultSort:
      changes.defaultSort !== undefined
        ? requireSortKey(changes.defaultSort)
        : settings.defaultSort,
    defaultCategory:
      changes.defaultCategory !== undefined
        ? requireCategory(changes.defaultCategory)
        : settings.defaultCategory,
    defaultStatus:
      changes.defaultStatus !== undefined
        ? requireStatus(changes.defaultStatus)
        : settings.defaultStatus,
  }
}
