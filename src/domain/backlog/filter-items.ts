import type { CategoryId } from './category-registry'
import type { Item } from './item'
import type { Priority } from './priority'
import type { Status } from './status'

export interface ItemFilters {
  category?: CategoryId
  status?: Status
  priority?: Priority
  platform?: string
  /** Item must have every tag listed here (AND semantics). */
  tags?: readonly string[]
  /** Matched case-insensitively against title, notes, and tags. */
  searchQuery?: string
}

function matchesSearchQuery(item: Item, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return true
  }
  if (item.title.toLowerCase().includes(needle)) {
    return true
  }
  if (item.notes?.toLowerCase().includes(needle)) {
    return true
  }
  return item.tags.some((tag) => tag.toLowerCase().includes(needle))
}

/** Narrows a snapshot of items down to those matching every given filter (AND across filters). */
export function filterItems(items: readonly Item[], filters: ItemFilters): Item[] {
  return items.filter((item) => {
    if (filters.category && item.category !== filters.category) {
      return false
    }
    if (filters.status && item.status !== filters.status) {
      return false
    }
    if (filters.priority && item.priority !== filters.priority) {
      return false
    }
    if (filters.platform && item.platform !== filters.platform) {
      return false
    }
    if (filters.tags && !filters.tags.every((tag) => item.tags.includes(tag))) {
      return false
    }
    if (filters.searchQuery && !matchesSearchQuery(item, filters.searchQuery)) {
      return false
    }
    return true
  })
}
