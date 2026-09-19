import { describe, expect, it } from 'vitest'

import type { GoalId, GoalItemId, ProjectId } from '@/domain/ids/ids'

import {
  addItem,
  answerQuestion,
  byWorkstream,
  completeItem,
  confirmHypothesis,
  decideItem,
  dependsOnTransitively,
  indexItems,
  isBlocked,
  isEffectivelyResolved,
  isResolved,
  linkToProject,
  nextAvailableItem,
  refuteHypothesis,
  renameItem,
  renameWorkstream,
  reopenItem,
  removeItem,
  renameGoal,
  setDependencies,
  standingFor,
  standingOf,
  unlinkFromProject,
  validateDependency,
  type Goal,
  type GoalItem,
  type GoalItemKind,
  type LinkedProjectInfo,
} from './goal'

let nextId = 0
const id = (): GoalItemId => `item-${String((nextId += 1))}` as GoalItemId

function item(kind: GoalItemKind, overrides: Partial<GoalItem> = {}): GoalItem {
  return {
    id: id(),
    workstream: 'General',
    kind,
    title: `A ${kind}`,
    dependsOn: [],
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function goal(items: readonly GoalItem[] = []): Goal {
  return {
    id: 'goal-1' as GoalId,
    name: 'Move somewhere new',
    items,
    createdAt: '2026-09-01T00:00:00.000Z',
  }
}

describe('isResolved', () => {
  it('treats a fact as resolved on arrival', () => {
    expect(isResolved(item('fact'))).toBe(true)
  })

  it('treats an undecided decision as unresolved', () => {
    expect(isResolved(item('decision'))).toBe(false)
    expect(isResolved(item('decision', { decidedAt: '2026-09-02T00:00:00.000Z' }))).toBe(true)
  })

  it('treats a hypothesis as resolved by confirmation or refutation', () => {
    expect(isResolved(item('hypothesis'))).toBe(false)
    expect(isResolved(item('hypothesis', { confirmedAt: '2026-09-02T00:00:00.000Z' }))).toBe(true)
    expect(isResolved(item('hypothesis', { refutedAt: '2026-09-02T00:00:00.000Z' }))).toBe(true)
  })

  it('treats a question as resolved once answered', () => {
    expect(isResolved(item('question'))).toBe(false)
    expect(isResolved(item('question', { answeredAt: '2026-09-02T00:00:00.000Z' }))).toBe(true)
  })

  it('treats an action or milestone as resolved once completed', () => {
    expect(isResolved(item('action'))).toBe(false)
    expect(isResolved(item('milestone', { completedAt: '2026-09-02T00:00:00.000Z' }))).toBe(true)
  })
})

describe('standingOf', () => {
  it('is blocked while any dependency is unresolved, available once none are', () => {
    const dependency = item('decision')
    const dependant = item('action', { dependsOn: [dependency.id] })
    const index = indexItems([dependency, dependant])

    expect(standingOf(dependant, index)).toBe('blocked')

    const decided = decideItem(goal([dependency, dependant]), dependency.id, 'Denver', 'now')
    expect(standingOf(dependant, indexItems(decided.items))).toBe('available')
  })

  it('reports resolved once the item itself is resolved, dependencies notwithstanding', () => {
    const dependency = item('decision')
    const resolved = item('action', {
      dependsOn: [dependency.id],
      completedAt: '2026-09-02T00:00:00.000Z',
    })
    const index = indexItems([dependency, resolved])

    // Nothing here is gated: an item can be marked resolved even while its
    // declared dependency is still open, the same "ordered but not gated"
    // stance a campaign's stages take.
    expect(standingOf(resolved, index)).toBe('resolved')
  })

  it('reports blocked only for dependencies that still exist', () => {
    const missing = 'ghost' as GoalItemId
    const dependant = item('action', { dependsOn: [missing] })
    const index = indexItems([dependant])

    expect(isBlocked(dependant, index)).toBe(false)
  })
})

describe('standingFor', () => {
  it('names which items a blocked item is waiting on', () => {
    const a = item('hypothesis')
    const b = item('question')
    const c = item('action', { dependsOn: [a.id, b.id] })

    const standing = standingFor(goal([a, b, c]))
    const cStanding = standing.items.find((one) => one.item.id === c.id)

    expect(cStanding?.standing).toBe('blocked')
    expect(cStanding?.waitingOn.map((one) => one.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('counts resolved against the total', () => {
    const a = item('fact')
    const b = item('question')

    const standing = standingFor(goal([a, b]))
    expect(standing.resolved).toBe(1)
    expect(standing.total).toBe(2)
  })

  it('groups into workstreams in the order they first appear', () => {
    const a = item('fact', { workstream: 'Destination' })
    const b = item('fact', { workstream: 'Finances' })
    const c = item('fact', { workstream: 'Destination' })

    const standing = standingFor(goal([a, b, c]))
    expect(standing.workstreams.map((one) => one.name)).toEqual(['Destination', 'Finances'])
    expect(standing.workstreams[0]?.items).toHaveLength(2)
  })
})

describe('byWorkstream', () => {
  it('is a no-op on an empty list', () => {
    expect(byWorkstream([])).toEqual([])
  })
})

describe('dependsOnTransitively', () => {
  it('finds a direct dependency', () => {
    const a = item('fact')
    const b = item('action', { dependsOn: [a.id] })
    const index = indexItems([a, b])

    expect(dependsOnTransitively(index, b.id, a.id)).toBe(true)
    expect(dependsOnTransitively(index, a.id, b.id)).toBe(false)
  })

  it('finds a transitive dependency through a chain', () => {
    const a = item('fact')
    const b = item('decision', { dependsOn: [a.id] })
    const c = item('action', { dependsOn: [b.id] })
    const index = indexItems([a, b, c])

    expect(dependsOnTransitively(index, c.id, a.id)).toBe(true)
  })

  it('terminates on a graph that already contains a cycle', () => {
    const a = item('fact')
    const b = item('fact', { dependsOn: [a.id] })
    const cyclic = { ...a, dependsOn: [b.id] }
    const index = indexItems([cyclic, b])

    expect(() => {
      dependsOnTransitively(index, cyclic.id, 'nothing' as GoalItemId)
    }).not.toThrow()
  })
})

describe('validateDependency', () => {
  it('refuses an item depending on itself', () => {
    const a = item('fact')
    expect(validateDependency([a], a.id, a.id)).toBe('An item cannot depend on itself.')
  })

  it('refuses a dependency that would close a loop', () => {
    const a = item('decision')
    const b = item('action', { dependsOn: [a.id] })

    expect(validateDependency([a, b], a.id, b.id)).toBe('That would create a circular dependency.')
  })

  it('allows a dependency that creates no cycle', () => {
    const a = item('decision')
    const b = item('action')

    expect(validateDependency([a, b], b.id, a.id)).toBeUndefined()
  })

  it('refuses an unknown item on either side', () => {
    const a = item('fact')
    expect(validateDependency([a], a.id, 'ghost' as GoalItemId)).toBe('Unknown item.')
    expect(validateDependency([a], 'ghost' as GoalItemId, a.id)).toBe('Unknown item.')
  })
})

describe('mutators', () => {
  it('adds an item', () => {
    const a = item('fact')
    const next = addItem(goal(), a)
    expect(next.items).toEqual([a])
  })

  it('decides, confirms, refutes, answers and completes independently by kind', () => {
    const decision = item('decision')
    const hypothesis = item('hypothesis')
    const question = item('question')
    const action = item('action')

    let g = goal([decision, hypothesis, question, action])
    g = decideItem(g, decision.id, 'Denver', '2026-09-02T00:00:00.000Z')
    g = confirmHypothesis(g, hypothesis.id, '2026-09-02T00:00:00.000Z')
    g = answerQuestion(g, question.id, 'Yes, remote is fine', '2026-09-02T00:00:00.000Z')
    g = completeItem(g, action.id, '2026-09-02T00:00:00.000Z')

    expect(g.items.every(isResolved)).toBe(true)
    expect(g.items.find((one) => one.id === decision.id)?.decidedAs).toBe('Denver')
  })

  it('refuting a hypothesis is progress, not left blank', () => {
    const hypothesis = item('hypothesis')
    const g = refuteHypothesis(goal([hypothesis]), hypothesis.id, '2026-09-02T00:00:00.000Z')
    const resolved = g.items[0]
    expect(resolved?.refutedAt).toBeDefined()
    expect(resolved !== undefined && isResolved(resolved)).toBe(true)
  })

  it('confirming clears a prior refutation and vice versa', () => {
    const hypothesis = item('hypothesis')
    let g = refuteHypothesis(goal([hypothesis]), hypothesis.id, 't1')
    g = confirmHypothesis(g, hypothesis.id, 't2')

    expect(g.items[0]?.refutedAt).toBeUndefined()
    expect(g.items[0]?.confirmedAt).toBe('t2')
  })

  it('reopens whichever resolution an item carries, regardless of kind', () => {
    const decision = item('decision', { decidedAs: 'Denver', decidedAt: 't1' })
    const g = reopenItem(goal([decision]), decision.id)
    const [reopened] = g.items
    if (reopened === undefined) throw new Error('Expected the item to survive reopening.')

    expect(isResolved(reopened)).toBe(false)
    expect(reopened.decidedAs).toBeUndefined()
  })

  it('is a no-op reopening a fact', () => {
    const fact = item('fact')
    const g = reopenItem(goal([fact]), fact.id)
    const [untouched] = g.items
    if (untouched === undefined) throw new Error('Expected the fact to survive reopening.')

    expect(isResolved(untouched)).toBe(true)
  })

  it('removes an item and strips it from every dependant', () => {
    const a = item('fact')
    const b = item('action', { dependsOn: [a.id] })
    const g = removeItem(goal([a, b]), a.id)

    expect(g.items).toHaveLength(1)
    expect(g.items[0]?.dependsOn).toEqual([])
  })

  it('sets dependencies directly', () => {
    const a = item('fact')
    const b = item('action')
    const g = setDependencies(goal([a, b]), b.id, [a.id])
    expect(g.items.find((one) => one.id === b.id)?.dependsOn).toEqual([a.id])
  })

  it('renames the goal and its aim, ignoring a blank name', () => {
    const g = renameGoal(goal(), 'New name', 'New aim')
    expect(g.name).toBe('New name')
    expect(g.aim).toBe('New aim')

    expect(renameGoal(g, '   ', 'ignored')).toBe(g)
  })

  it('clears the aim when renamed to blank rather than leaving a stale key', () => {
    const withAim = renameGoal(goal(), 'Name', 'Somewhere')
    const cleared = renameGoal(withAim, 'Name', '')
    expect('aim' in cleared).toBe(false)
  })

  it('renames an item, its workstream and its notes together, ignoring a blank title', () => {
    const a = item('fact', { title: 'Old', workstream: 'A', notes: 'Old note' })
    const g = renameItem(goal([a]), a.id, 'New', 'B', 'New note')

    expect(g.items[0]?.title).toBe('New')
    expect(g.items[0]?.workstream).toBe('B')
    expect(g.items[0]?.notes).toBe('New note')
    expect(renameItem(g, a.id, '   ', 'B', '')).toBe(g)
  })

  it('clears the notes when renamed to blank rather than leaving a stale key', () => {
    const a = item('fact', { notes: 'Something' })
    const g = renameItem(goal([a]), a.id, a.title, a.workstream, '')
    expect('notes' in (g.items[0] ?? {})).toBe(false)
  })
})

describe('renameWorkstream', () => {
  it('renames every item sharing the old workstream and leaves others alone', () => {
    const a = item('fact', { workstream: 'Destination' })
    const b = item('action', { workstream: 'Destination' })
    const c = item('fact', { workstream: 'Finances' })
    const g = renameWorkstream(goal([a, b, c]), 'Destination', 'Where to live')

    expect(g.items[0]?.workstream).toBe('Where to live')
    expect(g.items[1]?.workstream).toBe('Where to live')
    expect(g.items[2]?.workstream).toBe('Finances')
  })

  it('is a no-op on a blank name or an unchanged one', () => {
    const a = item('fact', { workstream: 'Destination' })
    const g = goal([a])

    expect(renameWorkstream(g, 'Destination', '   ')).toBe(g)
    expect(renameWorkstream(g, 'Destination', 'Destination')).toBe(g)
  })

  it('matches the workstream exactly, not case-insensitively', () => {
    const a = item('fact', { workstream: 'Destination' })
    const g = renameWorkstream(goal([a]), 'destination', 'Somewhere else')
    expect(g.items[0]?.workstream).toBe('Destination')
  })
})

describe('nextAvailableItem', () => {
  it('names the earliest available item, not a later one worked on out of order', () => {
    const a = item('fact')
    const b = item('action')
    const c = item('action')
    const standing = standingFor(goal([a, b, c]))

    expect(nextAvailableItem(standing)?.item.id).toBe(b.id)
  })

  it('is undefined when everything is resolved or blocked', () => {
    const resolved = item('fact')
    const a = item('action')
    const b = item('action')
    // A mutual dependency: neither can ever become available, which is
    // the fixture for "nothing available" rather than "nothing left".
    const withCycle = goal([resolved, { ...a, dependsOn: [b.id] }, { ...b, dependsOn: [a.id] }])

    expect(nextAvailableItem(standingFor(withCycle))).toBeUndefined()
  })
})

describe('linking an item to a quest', () => {
  const project = (completed: boolean): LinkedProjectInfo => ({
    id: 'project-1' as ProjectId,
    name: 'Declutter the garage',
    completed,
  })

  it('resolves an item via its linked quest, without touching the item itself', () => {
    const a = item('action')
    const linked = linkToProject(goal([a]), a.id, project(false).id)
    const [linkedItem] = linked.items
    if (linkedItem === undefined) throw new Error('Expected the item to survive linking.')

    expect(isEffectivelyResolved(linkedItem)).toBe(false)
    expect(isEffectivelyResolved(linkedItem, new Map([[project(true).id, project(true)]]))).toBe(
      true,
    )
    expect(linkedItem.completedAt).toBeUndefined()
  })

  it('carries the link through standingFor as a resolved standing and a linkedProject reading', () => {
    const a = item('action')
    const g = linkToProject(goal([a]), a.id, project(true).id)
    const standing = standingFor(g, new Map([[project(true).id, project(true)]]))

    expect(standing.items[0]?.standing).toBe('resolved')
    expect(standing.items[0]?.linkedProject).toEqual(project(true))
    expect(standing.resolved).toBe(1)
  })

  it('unblocks a dependant once the linked quest completes, in standingFor', () => {
    const a = item('action')
    const b = item('action', { dependsOn: [a.id] })
    const g = linkToProject(goal([a, b]), a.id, project(false).id)

    const blocked = standingFor(g, new Map([[project(false).id, project(false)]]))
    expect(blocked.items.find((one) => one.item.id === b.id)?.standing).toBe('blocked')

    const unblocked = standingFor(g, new Map([[project(true).id, project(true)]]))
    expect(unblocked.items.find((one) => one.item.id === b.id)?.standing).toBe('available')
  })

  it('unlinks, dropping the linkedProjectId', () => {
    const a = item('action')
    const linked = linkToProject(goal([a]), a.id, project(false).id)
    const unlinked = unlinkFromProject(linked, a.id)

    expect('linkedProjectId' in (unlinked.items[0] ?? {})).toBe(false)
  })
})
