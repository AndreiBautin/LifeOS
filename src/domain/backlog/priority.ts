export const PRIORITIES = ['high', 'medium', 'low', 'someday'] as const

export type Priority = (typeof PRIORITIES)[number]

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  someday: 'Someday',
}

/** Lower rank sorts first — used to order backlog items by urgency. */
export const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  someday: 3,
}

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value)
}
