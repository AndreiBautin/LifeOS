import { describe, expect, it } from 'vitest'

import { BacklogValidationError } from './errors'
import { applyBacklogSettingsChanges, DEFAULT_BACKLOG_SETTINGS } from './settings'

describe('DEFAULT_BACKLOG_SETTINGS', () => {
  it('is a fully valid, sensible starting point', () => {
    expect(DEFAULT_BACKLOG_SETTINGS).toEqual({
      defaultSort: 'recently-added',
      defaultCategory: 'games',
      defaultStatus: 'backlog',
    })
  })
})

describe('applyBacklogSettingsChanges', () => {
  it('merges a single change and leaves the rest untouched', () => {
    const updated = applyBacklogSettingsChanges(DEFAULT_BACKLOG_SETTINGS, {
      defaultCategory: 'books',
    })

    expect(updated.defaultCategory).toBe('books')
    expect(updated.defaultSort).toBe(DEFAULT_BACKLOG_SETTINGS.defaultSort)
  })

  it('applies changes to every field at once', () => {
    const updated = applyBacklogSettingsChanges(DEFAULT_BACKLOG_SETTINGS, {
      defaultSort: 'alphabetical',
      defaultCategory: 'books',
      defaultStatus: 'wishlist',
    })

    expect(updated).toEqual({
      defaultSort: 'alphabetical',
      defaultCategory: 'books',
      defaultStatus: 'wishlist',
    })
  })

  it('rejects an unknown sort key', () => {
    expect(() =>
      applyBacklogSettingsChanges(DEFAULT_BACKLOG_SETTINGS, { defaultSort: 'not-a-sort' }),
    ).toThrow(BacklogValidationError)
  })

  it('rejects an unknown category', () => {
    expect(() =>
      applyBacklogSettingsChanges(DEFAULT_BACKLOG_SETTINGS, { defaultCategory: 'not-a-category' }),
    ).toThrow(BacklogValidationError)
  })

  it('rejects an unknown status', () => {
    expect(() =>
      applyBacklogSettingsChanges(DEFAULT_BACKLOG_SETTINGS, { defaultStatus: 'not-a-status' }),
    ).toThrow(BacklogValidationError)
  })
})
