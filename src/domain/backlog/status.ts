export const STATUSES = [
  'backlog',
  'currently-using',
  'completed',
  'paused',
  'dropped',
  'wishlist',
] as const

export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  backlog: 'Backlog',
  'currently-using': 'Currently Using',
  completed: 'Completed',
  paused: 'Paused',
  dropped: 'Dropped',
  wishlist: 'Wishlist',
}

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value)
}
