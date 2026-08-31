import { describe, expect, it } from 'vitest'

import { asActionId, asProjectId } from '@/domain/ids/ids'
import type { Project, ProjectStatus } from '@/domain/projects/project'

import { board, byOutstanding, contracts, isContract, isDone } from './contract'

function project(name: string, steps: number, status: ProjectStatus = 'active'): Project {
  return {
    id: asProjectId(name),
    name,
    impact: 5,
    urgency: 5,
    effort: 5,
    status,
    kind: 'side',
    isBlocked: false,
    blockedBy: [],
    createdAt: '2026-08-01T09:00:00.000Z',
    actions: Array.from({ length: steps }, (_unused, index) => ({
      id: asActionId(`${name}-${String(index)}`),
      description: name,
      status: 'pending' as const,
      order: index + 1,
      createdAt: '2026-08-01T09:00:00.000Z',
    })),
  }
}

describe('what reads as a one-off', () => {
  /*
   * One step, and the number is load-bearing rather than tidy. XP is
   * paid per closed action and nothing pays for a project existing, so a
   * stepless one-off would earn nothing — and a section full of things
   * that pay nothing teaches you not to use it.
   */
  it('is a quest whose whole content is one step', () => {
    expect(isContract(project('Return the parcel', 1))).toBe(true)
    expect(isContract(project('Rewire the kitchen', 3))).toBe(false)
  })

  it('is not a quest with nothing to do at all', () => {
    expect(isContract(project('Vague intention', 0))).toBe(false)
  })

  /*
   * Derived, so a quest that grows a second step stops being a contract.
   * That is honest: the moment something needs breaking down it is no
   * longer a one-off, and it moves section rather than being wrong in
   * one of them.
   */
  it('stops being one the moment it needs breaking down', () => {
    const grown = project('Return the parcel', 2)

    expect(isContract(grown)).toBe(false)
    expect(board([grown])).toHaveLength(1)
  })

  it('drops out once it is finished, because nothing is hanging over you', () => {
    expect(isContract(project('Return the parcel', 1, 'completed'))).toBe(false)
  })

  /*
   * The two lists partition what is there. A record appearing in both
   * would read as a duplicate; one appearing in neither would vanish.
   */
  it('splits the projects with nothing lost or doubled', () => {
    const all = [
      project('Return the parcel', 1),
      project('Rewire the kitchen', 3),
      project('Vague intention', 0),
      project('Done thing', 1, 'completed'),
    ]

    expect(contracts(all).length + board(all).length).toBe(all.length)
    expect(contracts(all).some((one) => board(all).includes(one))).toBe(false)
  })
})

describe('ordering the section', () => {
  /*
   * Ticked ones sink. Closing the step is not the same as filing the
   * contract away — deriveStatus never completes a project on its own,
   * because closing one is a decision — so a done one-off waits at the
   * bottom rather than forking that rule for a single shape.
   */
  it('puts outstanding contracts above ticked ones', () => {
    const ticked = project('Return the parcel', 1)
    const done = {
      ...ticked,
      id: asProjectId('done'),
      actions: ticked.actions.map((one) => ({ ...one, status: 'done' as const })),
    }
    const open = project('Call the dentist', 1)

    expect(byOutstanding([done, open]).map((one) => one.name)).toEqual([
      'Call the dentist',
      'Return the parcel',
    ])
  })

  it('reads a contract as done only when its step is ticked', () => {
    const open = project('Call the dentist', 1)

    expect(isDone(open)).toBe(false)
    expect(isDone({ ...open, actions: open.actions.map((a) => ({ ...a, status: 'done' })) })).toBe(
      true,
    )
  })
})
