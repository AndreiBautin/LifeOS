export const PRIORITIES = ['mustVisit', 'high', 'medium', 'low', 'someday'] as const

export type Priority = (typeof PRIORITIES)[number]

export interface PriorityMetadata {
  readonly label: string
  /** Lower sorts first. Used by SortPlaces when sorting by priority. */
  readonly sortWeight: number
}

export const PRIORITY_METADATA: Record<Priority, PriorityMetadata> = {
  mustVisit: { label: 'Must Visit', sortWeight: 0 },
  high: { label: 'High', sortWeight: 1 },
  medium: { label: 'Medium', sortWeight: 2 },
  low: { label: 'Low', sortWeight: 3 },
  someday: { label: 'Someday', sortWeight: 4 },
}

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value)
}
