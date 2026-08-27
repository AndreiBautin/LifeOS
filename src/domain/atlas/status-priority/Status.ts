export const STATUSES = [
  'saved',
  'wantToVisit',
  'planning',
  'visited',
  'favorite',
  'archived',
] as const

export type Status = (typeof STATUSES)[number]

export interface StatusMetadata {
  readonly label: string
}

export const STATUS_METADATA: Record<Status, StatusMetadata> = {
  saved: { label: 'Saved' },
  wantToVisit: { label: 'Want To Visit' },
  planning: { label: 'Planning' },
  visited: { label: 'Visited' },
  favorite: { label: 'Favorite' },
  archived: { label: 'Archived' },
}

export function isStatus(value: string): value is Status {
  return (STATUSES as readonly string[]).includes(value)
}
