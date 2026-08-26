import { describe, expect, it } from 'vitest'

import { asProjectId, type ProjectId } from '@/domain/ids/ids'
import type { Project } from '@/domain/projects/project'
import type { Clock, ProjectRepository, TombstoneRepository } from '@/domain/repositories/ports'
import type { Tombstone } from '@/domain/sync/tombstone'

import {
  addAction,
  addProject,
  deleteProject,
  recommendation,
  setActionStatus,
  setBlockers,
  updateProject,
  type ProjectDeps,
} from './projects'

/**
 * The use-cases, against an in-memory double that stamps and buries.
 *
 * What is worth testing here is not the arithmetic — `priority.test.ts`
 * covers that — but the writes: which records a single operation touches,
 * and whether the graph is still consistent afterwards. The original
 * needed a live SQLite connection to answer any of those.
 */
function harness(at = '2026-08-26T09:00:00.000Z') {
  const store = new Map<string, Project>()
  const graves = new Map<string, Tombstone>()
  let sequence = 0

  const clock: Clock = { now: () => new Date(at) }

  const projects: ProjectRepository = {
    all: () => Promise.resolve([...store.values()]),
    byId: (id) => Promise.resolve(store.get(id as string)),
    save: (project) => {
      store.set(project.id, { ...project, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    saveMany: (incoming) => {
      for (const project of incoming) {
        store.set(project.id, { ...project, updatedAt: clock.now().toISOString() })
      }
      return Promise.resolve()
    },
    restoreMany: (incoming) => {
      for (const project of incoming) store.set(project.id, project)
      return Promise.resolve()
    },
    remove: (id: ProjectId) => {
      store.delete(id)
      graves.set(`projects:${id as string}`, {
        id,
        collection: 'projects',
        deletedAt: clock.now().toISOString(),
      })
      return Promise.resolve()
    },
    purge: (id: ProjectId) => {
      store.delete(id)
      return Promise.resolve()
    },
    clear: () => {
      store.clear()
      return Promise.resolve()
    },
    count: () => Promise.resolve(store.size),
  }

  const tombstones: TombstoneRepository = {
    all: () => Promise.resolve([...graves.values()]),
    since: () => Promise.resolve([]),
    record: () => Promise.resolve(),
  }

  const deps: ProjectDeps = {
    projects,
    clock,
    ids: {
      next: () => {
        sequence += 1
        return `id-${sequence.toString()}`
      },
    },
  }

  return { deps, projects, tombstones, store }
}

describe('adding a project', () => {
  it('starts active, with sensible defaults and no actions', async () => {
    const { deps } = harness()

    const project = await addProject({ name: '  Passport  ' }, deps)

    expect(project).toMatchObject({
      name: 'Passport',
      impact: 5,
      urgency: 5,
      effort: 5,
      status: 'active',
      actions: [],
    })
  })

  /*
   * The derivation runs on the way in, not only on update. A project
   * created already waiting on something open must not spend its first
   * moments claiming to be actionable.
   */
  it('is blocked on arrival when it names an open blocker', async () => {
    const { deps } = harness()
    const blocker = await addProject({ name: 'permit' }, deps)

    const waiting = await addProject({ name: 'build', blockedBy: [blocker.id] }, deps)

    expect(waiting.status).toBe('blocked')
  })
})

describe('completing a project', () => {
  /*
   * The rule the original needed a service and a database round trip for:
   * a project un-blocks the moment its last blocker completes, with no
   * manual step. Here it falls out of one write.
   */
  it('un-blocks everything that was waiting on it, in the same write', async () => {
    const { deps, projects } = harness()
    const blocker = await addProject({ name: 'permit' }, deps)
    const waiting = await addProject({ name: 'build', blockedBy: [blocker.id] }, deps)

    expect((await projects.byId(waiting.id))?.status).toBe('blocked')

    await updateProject(blocker.id, { status: 'completed' }, deps)

    expect((await projects.byId(waiting.id))?.status).toBe('active')
  })

  it('leaves a project blocked while any other blocker is still open', async () => {
    const { deps, projects } = harness()
    const one = await addProject({ name: 'permit' }, deps)
    const two = await addProject({ name: 'survey' }, deps)
    const waiting = await addProject({ name: 'build', blockedBy: [one.id, two.id] }, deps)

    await updateProject(one.id, { status: 'completed' }, deps)

    expect((await projects.byId(waiting.id))?.status).toBe('blocked')
  })

  it('does not disturb a paused project waiting on it', async () => {
    const { deps, projects } = harness()
    const blocker = await addProject({ name: 'permit' }, deps)
    const waiting = await addProject({ name: 'build', blockedBy: [blocker.id] }, deps)
    await updateProject(waiting.id, { status: 'paused' }, deps)

    await updateProject(blocker.id, { status: 'completed' }, deps)

    expect((await projects.byId(waiting.id))?.status).toBe('paused')
  })

  it('records when it was completed', async () => {
    const { deps } = harness()
    const project = await addProject({ name: 'passport' }, deps)

    const completed = await updateProject(project.id, { status: 'completed' }, deps)

    expect(completed.completedAt).toBe('2026-08-26T09:00:00.000Z')
  })
})

describe('editing a project', () => {
  /*
   * An absent field means "leave it alone" and `null` means "remove it".
   * Collapsing the two is how clearing a deadline becomes impossible, or
   * how every edit silently clears one.
   */
  it('clears a deadline on null and keeps it when the field is absent', async () => {
    const { deps } = harness()
    const project = await addProject({ name: 'taxes', deadline: '2026-09-30' }, deps)

    const renamed = await updateProject(project.id, { name: 'tax return' }, deps)
    expect(renamed.deadline).toBe('2026-09-30')

    const cleared = await updateProject(project.id, { deadline: null }, deps)
    expect(cleared.deadline).toBeUndefined()
    expect('deadline' in cleared).toBe(false)
  })

  it('refuses to edit something that is not there', async () => {
    const { deps } = harness()

    await expect(updateProject(asProjectId('nope'), { name: 'x' }, deps)).rejects.toThrow(
      /No project found/,
    )
  })
})

describe('setting blockers', () => {
  it('refuses a cycle and changes nothing', async () => {
    const { deps, projects } = harness()
    const a = await addProject({ name: 'a' }, deps)
    const b = await addProject({ name: 'b', blockedBy: [a.id] }, deps)

    const result = await setBlockers(a.id, [b.id], deps)

    expect(result.error).toMatch(/circular/)
    expect((await projects.byId(a.id))?.blockedBy).toEqual([])
  })

  it('applies a valid set and re-derives status', async () => {
    const { deps } = harness()
    const blocker = await addProject({ name: 'permit' }, deps)
    const project = await addProject({ name: 'build' }, deps)

    const result = await setBlockers(project.id, [blocker.id], deps)

    expect(result.error).toBeUndefined()
    expect(result.project?.status).toBe('blocked')
  })
})

describe('deleting a project', () => {
  /*
   * What the relational schema did on cascade delete, and the reason it
   * has to be written by hand now: a dangling id would sit in every
   * dependent's record, travel over sync, and come back to life if some
   * later project were created with the same id.
   */
  it('strips itself out of everything that was waiting on it', async () => {
    const { deps, projects } = harness()
    const blocker = await addProject({ name: 'permit' }, deps)
    const waiting = await addProject({ name: 'build', blockedBy: [blocker.id] }, deps)

    await deleteProject(blocker.id, deps)

    const after = await projects.byId(waiting.id)
    expect(after?.blockedBy).toEqual([])
    expect(after?.status).toBe('active')
  })

  it('records that it happened', async () => {
    const { deps, tombstones } = harness()
    const project = await addProject({ name: 'passport' }, deps)

    await deleteProject(project.id, deps)

    expect((await tombstones.all()).map((one) => one.id)).toEqual([project.id])
  })
})

describe('actions', () => {
  it('lands a new action at the bottom of the list', async () => {
    const { deps } = harness()
    const project = await addProject({ name: 'passport' }, deps)

    await addAction(project.id, 'find the old one', undefined, deps)
    const after = await addAction(project.id, 'book the appointment', undefined, deps)

    expect(after.actions.map((action) => action.order)).toEqual([1, 2])
  })

  /*
   * Finishing a checklist and declaring a project done are two different
   * claims, and the second is a decision. Progress reads 100% and the
   * project stays open, which is the honest state.
   */
  it('does not complete the project when the last action is closed', async () => {
    const { deps } = harness()
    const project = await addProject({ name: 'passport' }, deps)
    const withAction = await addAction(project.id, 'the only step', undefined, deps)
    const action = withAction.actions[0]
    if (action === undefined) throw new Error('the action was not added')

    const after = await setActionStatus(project.id, action.id, true, deps)

    expect(after.status).toBe('active')
    expect(after.actions[0]?.status).toBe('done')
  })

  it('re-opens an action closed by mistake, clearing its completion time', async () => {
    const { deps } = harness()
    const project = await addProject({ name: 'passport' }, deps)
    const withAction = await addAction(project.id, 'the step', undefined, deps)
    const action = withAction.actions[0]
    if (action === undefined) throw new Error('the action was not added')

    await setActionStatus(project.id, action.id, true, deps)
    const after = await setActionStatus(project.id, action.id, false, deps)

    expect(after.actions[0]?.status).toBe('pending')
    expect(after.actions[0]?.completedAt).toBeUndefined()
  })
})

describe('the recommendation', () => {
  /*
   * The whole point of the app, end to end: one thing to do, its reason,
   * derived locally, and closing it moves on to the next.
   */
  it('names one action, then the next one once it is closed', async () => {
    const { deps } = harness()
    const project = await addProject({ name: 'passport', impact: 10, urgency: 10, effort: 1 }, deps)
    const one = await addAction(project.id, 'find the old one', undefined, deps)
    const firstAction = one.actions[0]
    if (firstAction === undefined) throw new Error('the action was not added')
    await addAction(project.id, 'book the appointment', undefined, deps)

    const first = await recommendation(deps)
    expect(first.actionDescription).toBe('find the old one')
    expect(first.reason).toBe('Highest priority active project')

    await setActionStatus(project.id, firstAction.id, true, deps)

    expect((await recommendation(deps)).actionDescription).toBe('book the appointment')
  })

  it('explains itself when there is nothing to do', async () => {
    const { deps } = harness()

    const result = await recommendation(deps)

    expect(result.actionId).toBeUndefined()
    expect(result.reason).toMatch(/Nothing actionable/)
  })
})
