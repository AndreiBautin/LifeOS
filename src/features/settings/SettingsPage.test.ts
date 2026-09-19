import { describe, expect, it } from 'vitest'

import { BACKUP_COUNT_KEYS } from '@/domain/backup/envelope'

import { COUNT_LABELS } from './count-labels'

/**
 * `COUNT_LABELS` is a hand-written list beside `BackupCounts`, and a
 * hand-written list beside one that already exists is exactly the shape
 * this codebase's own history warns about — it drifted once, silently:
 * `vices`, `finance`, `campaigns`, `attempts`, `challenges`, `rooms`,
 * `resume` and `goals` were all missing, so the import preview
 * undercounted a real backup while the import itself stayed correct.
 * This is the guard that makes the next one drifting a failing test
 * rather than a quiet gap on a screen nobody is watching closely.
 */
describe('the import preview names every collection a backup carries', () => {
  it('has exactly one row per key in BackupCounts, no more and no fewer', () => {
    const labelled = COUNT_LABELS.map(([key]) => key).sort()
    expect(labelled).toEqual([...BACKUP_COUNT_KEYS].sort())
  })

  it('never repeats a key', () => {
    const keys = COUNT_LABELS.map(([key]) => key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
