import type { BackupCounts } from '@/domain/backup/envelope'

/**
 * What each collection is called, in the order a person would read it.
 *
 * Kept apart from `SettingsPage.tsx` for the reason `styles.ts` already
 * states: a file exporting both a component and a constant breaks React
 * Fast Refresh.
 *
 * A hand-written list beside `BackupCounts` is exactly the shape this
 * codebase warns about elsewhere — `vices`, `finance`, `campaigns`,
 * `attempts`, `challenges`, `rooms`, `resume` and `goals` had all
 * drifted out of it, so the import preview silently undercounted a
 * real backup while the import itself (which reads `BackupCounts`
 * directly) stayed correct. `SettingsPage.test.ts` holds this list to
 * naming every key exactly once.
 */
export const COUNT_LABELS: readonly (readonly [keyof BackupCounts, string])[] = [
  ['workouts', 'workouts'],
  ['exercises', 'exercises'],
  ['checkIns', 'check-ins'],
  ['items', 'backlog items'],
  ['projects', 'projects'],
  ['upgrades', 'upgrades'],
  ['places', 'places'],
  ['trips', 'trips'],
  ['reviews', 'monthly reviews'],
  ['metrics', 'tracked metrics'],
  ['vices', 'buffs'],
  ['finance', 'monthly finance readings'],
  ['campaigns', 'arcs'],
  ['goals', 'complex goals'],
  ['attempts', 'practice problems'],
  ['challenges', 'seasonal challenges'],
  ['rooms', 'rooms'],
  ['resume', 'the resume'],
  ['exploredCells', 'squares of walked ground'],
]
