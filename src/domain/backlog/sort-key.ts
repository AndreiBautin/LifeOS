export const SORT_KEYS = [
  'recently-added',
  'alphabetical',
  'priority',
  'recently-completed',
  'recently-updated',
] as const

export type SortKey = (typeof SORT_KEYS)[number]

export const SORT_KEY_LABELS: Record<SortKey, string> = {
  'recently-added': 'Recently Added',
  alphabetical: 'Alphabetical',
  priority: 'Priority',
  'recently-completed': 'Recently Completed',
  'recently-updated': 'Recently Updated',
}

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value)
}
