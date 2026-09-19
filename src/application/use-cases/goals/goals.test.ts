import { describe, expect, it } from 'vitest'

import type { Goal } from '@/domain/goals/goal'
import type { GoalId, GoalItemId, ProjectId } from '@/domain/ids/ids'
import type { Project } from '@/domain/projects/project'

import {
  addGoal,
  addItemTo,
  answerQuestionIn,
  completeItemIn,
  confirmHypothesisIn,
  decideItemIn,
  goalStanding,
  goalStandings,
  linkableProjects,
  linkItemToProjectIn,
  refuteHypothesisIn,
  removeGoal,
  removeItemFrom,
  renameGoalIn,
  renameItemIn,
  renameWorkstreamIn,
  reopenItemIn,
  setDependenciesIn,
  unlinkItemFromProjectIn,
  unlinkProjectEverywhere,
  type GoalDeps,
} from './goals'

function deps(options: { readonly now?: string } = {}) {
  let counter = 0
  let stored: Goal[] = []
  let projectRows: Project[] = []

  const goals = {
    all: () => Promise.resolve(stored),
    byId: (id: GoalId) => Promise.resolve(stored.find((one) => one.id === id)),
    save: (goal: Goal) => {
      stored = [...stored.filter((one) => one.id !== goal.id), goal]
      return Promise.resolve()
    },
    restoreMany: (goals: readonly Goal[]) => {
      stored = [...goals]
      return Promise.resolve()
    },
    remove: (id: GoalId) => {
      stored = stored.filter((one) => one.id !== id)
      return Promise.resolve()
    },
    purge: (id: GoalId) => {
      stored = stored.filter((one) => one.id !== id)
      return Promise.resolve()
    },
  }

  const projects = {
    all: () => Promise.resolve(projectRows),
    byId: (id: ProjectId) => Promise.resolve(projectRows.find((one) => one.id === id)),
    save: (project: Project) => {
      projectRows = [...projectRows.filter((one) => one.id !== project.id), project]
      return Promise.resolve()
    },
    saveMany: (many: readonly Project[]) => {
      for (const project of many) {
        projectRows = [...projectRows.filter((one) => one.id !== project.id), project]
      }
      return Promise.resolve()
    },
    restoreMany: (many: readonly Project[]) => {
      projectRows = [...many]
      return Promise.resolve()
    },
    remove: (id: ProjectId) => {
      projectRows = projectRows.filter((one) => one.id !== id)
      return Promise.resolve()
    },
    purge: (id: ProjectId) => {
      projectRows = projectRows.filter((one) => one.id !== id)
      return Promise.resolve()
    },
    clear: () => {
      projectRows = []
      return Promise.resolve()
    },
    count: () => Promise.resolve(projectRows.length),
  }

  const clock = { now: () => new Date(options.now ?? '2026-09-01T10:00:00.000Z') }
  const ids = { next: () => `id-${String((counter += 1))}` }

  /** A quest to link a goal item to, for the tests that need one. */
  function addProject(name: string, status: Project['status'] = 'active'): Project {
    const project: Project = {
      id: `project-${String((counter += 1))}` as ProjectId,
      name,
      status,
      impact: 5,
      urgency: 5,
      effort: 5,
      isBlocked: false,
      actions: [],
      blockedBy: [],
      createdAt: clock.now().toISOString(),
    }
    projectRows = [...projectRows, project]
    return project
  }

  return { goals, projects, clock, ids, addProject } satisfies GoalDeps & {
    readonly addProject: typeof addProject
  }
}

/** Narrows an optional value in a test, the way the app's own tests throw on a missing action rather than asserting one exists. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value.')
  return value
}

describe('addGoal', () => {
  it('refuses a blank name', async () => {
    const result = await addGoal({ name: '  ' }, deps())
    expect(result.error).toBeDefined()
  })

  it('creates a goal with its opening items in one write', async () => {
    const result = await addGoal(
      {
        name: 'Move to a new city',
        aim: 'Somewhere we actually want to live',
        items: [
          { workstream: 'Destination', kind: 'question', title: 'Where do we want to live?' },
          { workstream: 'Finance', kind: 'fact', title: 'Current salary is $117,000' },
        ],
      },
      deps(),
    )

    expect(result.error).toBeUndefined()
    expect(result.goal?.items).toHaveLength(2)
    expect(result.goal?.aim).toBe('Somewhere we actually want to live')
  })

  it('drops a blank item rather than storing an empty title', async () => {
    const result = await addGoal(
      { name: 'Move', items: [{ workstream: 'A', kind: 'fact', title: '   ' }] },
      deps(),
    )
    expect(result.goal?.items).toHaveLength(0)
  })
})

describe('reading goals back', () => {
  it('sorts standings by creation order', async () => {
    const d = deps()
    await addGoal({ name: 'First' }, d)
    await addGoal({ name: 'Second' }, d)

    const standings = await goalStandings(d)
    expect(standings.map((one) => one.goal.name)).toEqual(['First', 'Second'])
  })

  it('reads a single goal by id', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const standing = await goalStanding(must(created.goal?.id), d)
    expect(standing?.goal.name).toBe('Move')
  })

  it('is undefined for an unknown id', async () => {
    const standing = await goalStanding('ghost' as GoalId, deps())
    expect(standing).toBeUndefined()
  })
})

describe('addItemTo', () => {
  it('refuses when the goal does not exist', async () => {
    const result = await addItemTo(
      'ghost' as GoalId,
      { workstream: 'A', kind: 'fact', title: 'Something' },
      deps(),
    )
    expect(result.error).toBeDefined()
  })

  it('adds an item with no dependencies, which can never be a cycle', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)

    await addItemTo(id, { workstream: 'Destination', kind: 'hypothesis', title: 'Denver fits' }, d)
    const standing = await goalStanding(id, d)
    expect(standing?.items).toHaveLength(1)
    expect(standing?.items[0]?.standing).toBe('available')
  })
})

describe('setDependenciesIn', () => {
  async function twoItems(d: GoalDeps) {
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'decision', title: 'Where to live' }, d)
    await addItemTo(id, { workstream: 'B', kind: 'action', title: 'List the house' }, d)
    const standing = await goalStanding(id, d)
    const [decision, action] = standing?.items ?? []
    return { id, decision: must(decision?.item.id), action: must(action?.item.id) }
  }

  it('blocks the dependant until the dependency resolves', async () => {
    const d = deps()
    const { id, decision, action } = await twoItems(d)

    await setDependenciesIn(id, action, [decision], d)
    const before = await goalStanding(id, d)
    expect(before?.items.find((one) => one.item.id === action)?.standing).toBe('blocked')

    await decideItemIn(id, decision, 'Denver', d)
    const after = await goalStanding(id, d)
    expect(after?.items.find((one) => one.item.id === action)?.standing).toBe('available')
  })

  it('refuses a dependency that would create a cycle', async () => {
    const d = deps()
    const { id, decision, action } = await twoItems(d)

    await setDependenciesIn(id, action, [decision], d)
    const result = await setDependenciesIn(id, decision, [action], d)

    expect(result.error).toBe('That would create a circular dependency.')
  })

  it('is a no-op on an unknown goal', async () => {
    const result = await setDependenciesIn('ghost' as GoalId, 'a' as GoalItemId, [], deps())
    expect(result.error).toBeUndefined()
  })
})

describe('resolving items', () => {
  async function oneOfEach(d: GoalDeps) {
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'decision', title: 'Where' }, d)
    await addItemTo(id, { workstream: 'A', kind: 'hypothesis', title: 'Fits budget' }, d)
    await addItemTo(id, { workstream: 'A', kind: 'question', title: 'Remote ok?' }, d)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Book the movers' }, d)
    const standing = await goalStanding(id, d)
    const items = standing?.items ?? []
    return {
      id,
      decision: must(items[0]?.item.id),
      hypothesis: must(items[1]?.item.id),
      question: must(items[2]?.item.id),
      action: must(items[3]?.item.id),
    }
  }

  it('decides, confirms, refutes, answers and completes each kind', async () => {
    const d = deps()
    const { id, decision, hypothesis, question, action } = await oneOfEach(d)

    await decideItemIn(id, decision, 'Denver', d)
    await confirmHypothesisIn(id, hypothesis, d)
    await answerQuestionIn(id, question, 'Yes', d)
    await completeItemIn(id, action, d)

    const standing = await goalStanding(id, d)
    expect(standing?.resolved).toBe(4)
  })

  it('treats refuting a hypothesis as resolving it, not failing it', async () => {
    const d = deps()
    const { id, hypothesis } = await oneOfEach(d)

    await refuteHypothesisIn(id, hypothesis, d)
    const standing = await goalStanding(id, d)
    expect(standing?.items.find((one) => one.item.id === hypothesis)?.standing).toBe('resolved')
  })

  it('reopens a resolved item, whatever kind it is', async () => {
    const d = deps()
    const { id, decision } = await oneOfEach(d)

    await decideItemIn(id, decision, 'Denver', d)
    await reopenItemIn(id, decision, d)

    const standing = await goalStanding(id, d)
    expect(standing?.items.find((one) => one.item.id === decision)?.standing).toBe('available')
  })
})

describe('removeItemFrom', () => {
  it('strips the removed item from anything that depended on it', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'decision', title: 'Where' }, d)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Book' }, d)

    const before = await goalStanding(id, d)
    const [decision, action] = before?.items ?? []
    const decisionId = must(decision?.item.id)
    await setDependenciesIn(id, must(action?.item.id), [decisionId], d)

    await removeItemFrom(id, decisionId, d)

    const after = await goalStanding(id, d)
    expect(after?.items).toHaveLength(1)
    expect(after?.items[0]?.item.dependsOn).toEqual([])
  })
})

describe('renameGoalIn and removeGoal', () => {
  it('renames the goal and its aim', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)

    await renameGoalIn(id, 'Relocate', 'Somewhere better', d)
    const standing = await goalStanding(id, d)
    expect(standing?.goal.name).toBe('Relocate')
    expect(standing?.goal.aim).toBe('Somewhere better')
  })

  it('removes a goal outright', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)

    await removeGoal(id, d)
    expect(await goalStanding(id, d)).toBeUndefined()
  })
})

describe('linking an item to a quest', () => {
  it('resolves the item once the linked quest completes, without touching the item', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Declutter the garage' }, d)
    const before = await goalStanding(id, d)
    const itemId = must(before?.items[0]?.item.id)

    const project = d.addProject('Declutter the garage')
    await linkItemToProjectIn(id, itemId, project.id, d)

    const linked = await goalStanding(id, d)
    expect(linked?.items[0]?.standing).toBe('available')
    expect(linked?.items[0]?.item.completedAt).toBeUndefined()
    expect(linked?.items[0]?.linkedProject).toEqual({
      id: project.id,
      name: 'Declutter the garage',
      completed: false,
    })

    await d.projects.save({ ...project, status: 'completed' })

    const afterQuest = await goalStanding(id, d)
    expect(afterQuest?.items[0]?.standing).toBe('resolved')
    expect(afterQuest?.items[0]?.item.completedAt).toBeUndefined()
  })

  it('unblocks a dependant once the linked quest completes', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Get an inspection' }, d)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Declutter' }, d)
    const before = await goalStanding(id, d)
    const inspection = must(before?.items[0]?.item.id)
    const declutter = must(before?.items[1]?.item.id)

    await setDependenciesIn(id, inspection, [declutter], d)
    const project = d.addProject('Declutter')
    await linkItemToProjectIn(id, declutter, project.id, d)

    const blocked = await goalStanding(id, d)
    expect(blocked?.items.find((one) => one.item.id === inspection)?.standing).toBe('blocked')

    await d.projects.save({ ...project, status: 'completed' })
    const unblocked = await goalStanding(id, d)
    expect(unblocked?.items.find((one) => one.item.id === inspection)?.standing).toBe('available')
  })

  it('unlinks, returning the item to its own resolution', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Declutter' }, d)
    const before = await goalStanding(id, d)
    const itemId = must(before?.items[0]?.item.id)

    const project = d.addProject('Declutter', 'completed')
    await linkItemToProjectIn(id, itemId, project.id, d)
    expect((await goalStanding(id, d))?.items[0]?.standing).toBe('resolved')

    await unlinkItemFromProjectIn(id, itemId, d)
    const after = await goalStanding(id, d)
    expect(after?.items[0]?.standing).toBe('available')
    expect(after?.items[0]?.linkedProject).toBeUndefined()
  })

  it('lists every quest for a picker', async () => {
    const d = deps()
    d.addProject('B quest')
    d.addProject('A quest')

    const listed = await linkableProjects(d)
    expect(listed.map((one) => one.name)).toEqual(['A quest', 'B quest'])
  })
})

describe('renameItemIn', () => {
  it('renames an item and its notes and workstream, in one write', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'fact', title: 'Old title' }, d)
    const before = await goalStanding(id, d)
    const itemId = must(before?.items[0]?.item.id)

    await renameItemIn(id, itemId, 'New title', 'B', 'A note', d)

    const after = await goalStanding(id, d)
    const item = after?.items[0]?.item
    expect(item?.title).toBe('New title')
    expect(item?.workstream).toBe('B')
    expect(item?.notes).toBe('A note')
  })

  it('ignores a blank title', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'fact', title: 'Old title' }, d)
    const before = await goalStanding(id, d)
    const itemId = must(before?.items[0]?.item.id)

    await renameItemIn(id, itemId, '   ', 'B', '', d)

    const after = await goalStanding(id, d)
    expect(after?.items[0]?.item.title).toBe('Old title')
  })
})

describe('renameWorkstreamIn', () => {
  it('renames every item sharing the workstream, in one write', async () => {
    const d = deps()
    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'Destination', kind: 'fact', title: 'A' }, d)
    await addItemTo(id, { workstream: 'Destination', kind: 'action', title: 'B' }, d)
    await addItemTo(id, { workstream: 'Finances', kind: 'fact', title: 'C' }, d)

    await renameWorkstreamIn(id, 'Destination', 'Where to live', d)

    const after = await goalStanding(id, d)
    expect(after?.items.map((one) => one.item.workstream)).toEqual([
      'Where to live',
      'Where to live',
      'Finances',
    ])
  })

  it('is a no-op on an unknown goal', async () => {
    await expect(renameWorkstreamIn('ghost' as GoalId, 'A', 'B', deps())).resolves.toBeUndefined()
  })
})

describe('unlinkProjectEverywhere', () => {
  it('clears the dangling link from every item and goal it touched', async () => {
    const d = deps()
    const project = d.addProject('Declutter the garage')

    const first = await addGoal({ name: 'Move' }, d)
    const firstId = must(first.goal?.id)
    await addItemTo(firstId, { workstream: 'A', kind: 'action', title: 'Declutter' }, d)
    const firstBefore = await goalStanding(firstId, d)
    const firstItemId = must(firstBefore?.items[0]?.item.id)
    await linkItemToProjectIn(firstId, firstItemId, project.id, d)

    const second = await addGoal({ name: 'Downsize' }, d)
    const secondId = must(second.goal?.id)
    await addItemTo(secondId, { workstream: 'A', kind: 'action', title: 'Clear the garage' }, d)
    const secondBefore = await goalStanding(secondId, d)
    const secondItemId = must(secondBefore?.items[0]?.item.id)
    await linkItemToProjectIn(secondId, secondItemId, project.id, d)

    await unlinkProjectEverywhere(project.id, d)

    const firstAfter = await goalStanding(firstId, d)
    const secondAfter = await goalStanding(secondId, d)
    expect(firstAfter?.items[0]?.item.linkedProjectId).toBeUndefined()
    expect(secondAfter?.items[0]?.item.linkedProjectId).toBeUndefined()
  })

  it('leaves goals with no link to that quest untouched', async () => {
    const d = deps()
    const project = d.addProject('Declutter the garage')
    const other = d.addProject('Something else')

    const created = await addGoal({ name: 'Move' }, d)
    const id = must(created.goal?.id)
    await addItemTo(id, { workstream: 'A', kind: 'action', title: 'Declutter' }, d)
    const before = await goalStanding(id, d)
    const itemId = must(before?.items[0]?.item.id)
    await linkItemToProjectIn(id, itemId, other.id, d)

    await unlinkProjectEverywhere(project.id, d)

    const after = await goalStanding(id, d)
    expect(after?.items[0]?.item.linkedProjectId).toBe(other.id)
  })

  it('is a no-op when nothing links to that quest', async () => {
    const d = deps()
    const project = d.addProject('Unused')
    await expect(unlinkProjectEverywhere(project.id, d)).resolves.toBeUndefined()
  })
})
