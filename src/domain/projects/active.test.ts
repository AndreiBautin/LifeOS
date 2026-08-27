import { describe, expect, it } from 'vitest'

import { asProjectId } from '@/domain/ids/ids'

import { activate, activeQuest, kindOf, standDown } from './active'
import type { Project } from './project'

/**
 * "Active" is derived from a timestamp rather than read off a flag, and
 * every test here is about why that was worth doing.
 */
function aQuest(over: Omit<Partial<Project>, 'id'> & { id: string }): Project {
  return {
    name: 'Something',
    impact: 5,
    urgency: 5,
    effort: 5,
    status: 'active',
    isBlocked: false,
    blockedBy: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    actions: [],
    ...over,
    id: asProjectId(over.id),
  }
}

describe('which quest is active', () => {
  it('is the most recently activated of its kind', () => {
    const quests = [
      aQuest({ id: 'a', kind: 'main', activatedAt: '2026-08-01T00:00:00.000Z' }),
      aQuest({ id: 'b', kind: 'main', activatedAt: '2026-08-20T00:00:00.000Z' }),
    ]

    expect(activeQuest(quests, 'main')?.id).toBe('b')
  })

  /*
   * The reason this is a stamp and not a boolean. Two devices each
   * activating a different quest while apart both set their own, and
   * last-write-wins leaves both claiming it — a boolean has no tie-break
   * and a timestamp always has a greatest element.
   */
  it('picks one even when a merge left two stamped', () => {
    const quests = [
      aQuest({ id: 'phone', kind: 'main', activatedAt: '2026-08-20T09:00:00.000Z' }),
      aQuest({ id: 'desk', kind: 'main', activatedAt: '2026-08-20T11:00:00.000Z' }),
    ]

    expect(activeQuest(quests, 'main')?.id).toBe('desk')
  })

  it('keeps the two kinds apart', () => {
    const quests = [
      aQuest({ id: 'm', kind: 'main', activatedAt: '2026-08-01T00:00:00.000Z' }),
      aQuest({ id: 's', kind: 'side', activatedAt: '2026-08-20T00:00:00.000Z' }),
    ]

    expect(activeQuest(quests, 'main')?.id).toBe('m')
    expect(activeQuest(quests, 'side')?.id).toBe('s')
  })

  /*
   * Finishing the thing you were on should not leave it at the top of the
   * screen as your current business, and needing a separate stand-down for
   * that would be a second action for one event.
   */
  it('is nobody once the active quest is completed', () => {
    const quests = [
      aQuest({
        id: 'a',
        kind: 'main',
        status: 'completed',
        activatedAt: '2026-08-20T00:00:00.000Z',
      }),
    ]

    expect(activeQuest(quests, 'main')).toBeUndefined()
  })

  it('is nobody when nothing was ever activated', () => {
    expect(activeQuest([aQuest({ id: 'a', kind: 'main' })], 'main')).toBeUndefined()
  })

  it('treats a quest with no kind as a side quest', () => {
    const quest = aQuest({ id: 'a', activatedAt: '2026-08-20T00:00:00.000Z' })

    expect(kindOf(quest)).toBe('side')
    expect(activeQuest([quest], 'side')?.id).toBe('a')
    expect(activeQuest([quest], 'main')).toBeUndefined()
  })
})

describe('activating one', () => {
  it('stamps the new one and stands the old one down', () => {
    const quests = [
      aQuest({ id: 'old', kind: 'main', activatedAt: '2026-08-01T00:00:00.000Z' }),
      aQuest({ id: 'new', kind: 'main' }),
    ]

    const changed = activate(quests, asProjectId('new'), '2026-08-27T09:00:00.000Z')

    expect(changed).toHaveLength(2)
    expect(changed.find((one) => one.id === 'new')?.activatedAt).toBe('2026-08-27T09:00:00.000Z')
    expect(changed.find((one) => one.id === 'old')?.activatedAt).toBeUndefined()
  })

  /*
   * The stamp is *removed*, not set to `undefined`. A key holding
   * undefined is still a key — IndexedDB keeps it and sync would carry it.
   */
  it('removes the old stamp rather than nulling it', () => {
    const quests = [
      aQuest({ id: 'old', kind: 'main', activatedAt: '2026-08-01T00:00:00.000Z' }),
      aQuest({ id: 'new', kind: 'main' }),
    ]

    const old = activate(quests, asProjectId('new'), '2026-08-27T09:00:00.000Z').find(
      (one) => one.id === 'old',
    )

    expect(old !== undefined && 'activatedAt' in old).toBe(false)
  })

  it('leaves the other kind alone', () => {
    const quests = [
      aQuest({ id: 'side', kind: 'side', activatedAt: '2026-08-01T00:00:00.000Z' }),
      aQuest({ id: 'main', kind: 'main' }),
    ]

    const changed = activate(quests, asProjectId('main'), '2026-08-27T09:00:00.000Z')

    expect(changed.map((one) => one.id)).toEqual(['main'])
  })

  it('writes nothing for a quest that does not exist', () => {
    expect(activate([], asProjectId('ghost'), '2026-08-27T09:00:00.000Z')).toEqual([])
  })
})

describe('standing down', () => {
  it('clears the kind and leaves the other', () => {
    const quests = [
      aQuest({ id: 'm', kind: 'main', activatedAt: '2026-08-01T00:00:00.000Z' }),
      aQuest({ id: 's', kind: 'side', activatedAt: '2026-08-01T00:00:00.000Z' }),
    ]

    const changed = standDown(quests, 'main')
    // The side quest is untouched, so the merged view is the cleared main
    // plus whatever standDown did not return.
    const after = [...changed, ...quests.filter((one) => one.kind !== 'main')]

    expect(changed.map((one) => one.id)).toEqual(['m'])
    expect(activeQuest(after, 'main')).toBeUndefined()
    expect(activeQuest(after, 'side')?.id).toBe('s')
  })
})
