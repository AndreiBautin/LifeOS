import { describe, expect, it } from 'vitest'

import { asProjectId, type ProjectId } from '@/domain/ids/ids'

import { dependentsOf, recomputeStatuses, validateBlockers, withoutBlocker } from './blocking'
import type { Project } from './project'

/**
 * Ported from `BlockingServiceTests.cs`, which needed a SQLite connection
 * per test to answer questions the schema was half-enforcing. None of that
 * survives: the graph is a few dozen records in memory, so these are
 * ordinary function calls.
 *
 * What is gone with it is the database half of the cycle guard. It was
 * enforced in the schema *and* in the code, and only the code half moves —
 * which makes these tests the only thing standing between a circular
 * dependency and a page that hangs.
 */

const id = (name: string): ProjectId => asProjectId(name)

function aProject(name: string, overrides: Partial<Project> = {}): Project {
  return {
    id: id(name),
    name,
    impact: 5,
    urgency: 5,
    effort: 5,
    status: 'active',
    isBlocked: false,
    blockedBy: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    actions: [],
    ...overrides,
  }
}

describe('validateBlockers', () => {
  it('accepts an empty set', () => {
    expect(validateBlockers([aProject('a')], id('a'), [])).toBeUndefined()
  })

  it('rejects a project blocking itself', () => {
    expect(validateBlockers([aProject('a')], id('a'), [id('a')])).toMatch(/cannot block itself/)
  })

  it('rejects an unknown project', () => {
    expect(validateBlockers([aProject('a')], id('a'), [id('ghost')])).toMatch(/Unknown project/)
  })

  it('rejects a direct two-project cycle', () => {
    // b already waits on a, so making a wait on b closes the loop.
    const projects = [aProject('a'), aProject('b', { blockedBy: [id('a')] })]

    expect(validateBlockers(projects, id('a'), [id('b')])).toMatch(/circular/)
  })

  it('rejects a longer transitive cycle', () => {
    const projects = [
      aProject('a'),
      aProject('b', { blockedBy: [id('a')] }),
      aProject('c', { blockedBy: [id('b')] }),
    ]

    expect(validateBlockers(projects, id('a'), [id('c')])).toMatch(/circular/)
  })

  /*
   * Two paths to the same ancestor is not a cycle, and refusing it would
   * rule out the ordinary shape of "these two both need the permit".
   */
  it('allows a diamond', () => {
    const projects = [
      aProject('root'),
      aProject('left', { blockedBy: [id('root')] }),
      aProject('right', { blockedBy: [id('root')] }),
      aProject('tip'),
    ]

    expect(validateBlockers(projects, id('tip'), [id('left'), id('right')])).toBeUndefined()
  })

  it('ignores a repeated id rather than reading it as a cycle', () => {
    const projects = [aProject('a'), aProject('b')]

    expect(validateBlockers(projects, id('a'), [id('b'), id('b')])).toBeUndefined()
  })

  /*
   * A graph that is already circular — written by an older build, or by two
   * devices each agreeing to half of it — must not hang the walk.
   */
  it('terminates on a graph that is already a cycle', () => {
    // Nothing here reaches `c`, so the honest answer is "not a cycle". The
    // assertion matters less than the fact that this returns at all — the
    // walk has to notice it has been here before, or the page hangs.
    const projects = [
      aProject('a', { blockedBy: [id('b')] }),
      aProject('b', { blockedBy: [id('a')] }),
      aProject('c'),
    ]

    expect(validateBlockers(projects, id('c'), [id('a')])).toBeUndefined()
  })
})

describe('dependentsOf', () => {
  it('finds the projects waiting on the given one', () => {
    const projects = [
      aProject('blocker'),
      aProject('waiting-one', { blockedBy: [id('blocker')] }),
      aProject('waiting-two', { blockedBy: [id('blocker')] }),
      aProject('unrelated'),
    ]

    expect(dependentsOf(projects, id('blocker'))).toEqual([id('waiting-one'), id('waiting-two')])
  })
})

describe('recomputeStatuses', () => {
  it('un-blocks a project once its blocker completes', () => {
    const projects = [
      aProject('blocker', { status: 'completed' }),
      aProject('waiting', { status: 'blocked', blockedBy: [id('blocker')] }),
    ]

    expect(recomputeStatuses(projects)).toEqual([
      expect.objectContaining({ id: id('waiting'), status: 'active' }),
    ])
  })

  it('keeps a project blocked while any blocker is still open', () => {
    const projects = [
      aProject('done', { status: 'completed' }),
      aProject('open', { status: 'active' }),
      aProject('waiting', { status: 'blocked', blockedBy: [id('done'), id('open')] }),
    ]

    expect(recomputeStatuses(projects)).toEqual([])
  })

  it('does not disturb a paused project', () => {
    const projects = [
      aProject('blocker', { status: 'completed' }),
      aProject('paused', { status: 'paused', blockedBy: [id('blocker')] }),
    ]

    expect(recomputeStatuses(projects)).toEqual([])
  })

  it('blocks a project that has just acquired an open blocker', () => {
    const projects = [
      aProject('open', { status: 'active' }),
      aProject('newly-waiting', { status: 'active', blockedBy: [id('open')] }),
    ]

    expect(recomputeStatuses(projects)).toEqual([
      expect.objectContaining({ id: id('newly-waiting'), status: 'blocked' }),
    ])
  })

  /*
   * Only what moved. Returning every project would restamp records that
   * did not change, and a restamped record travels over sync claiming to
   * be news.
   */
  it('returns nothing when nothing moved', () => {
    expect(recomputeStatuses([aProject('a'), aProject('b')])).toEqual([])
  })
})

describe('withoutBlocker', () => {
  /*
   * What the relational schema did on cascade delete. Nothing is *stuck*
   * without it — a dangling id counts as no blocker — but the reference
   * would sit in the record, travel over sync, and come back to life if
   * some later project were ever created with the same id.
   */
  it('strips a deleted project from everyone waiting on it', () => {
    const projects = [
      aProject('waiting', { blockedBy: [id('gone'), id('other')] }),
      aProject('unrelated', { blockedBy: [id('other')] }),
    ]

    expect(withoutBlocker(projects, id('gone'))).toEqual([
      expect.objectContaining({ id: id('waiting'), blockedBy: [id('other')] }),
    ])
  })
})
