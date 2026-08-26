import { describe, expect, it } from 'vitest'

import type { Item } from '@/domain/backlog/item'
import { createItemEnvelope } from '@/domain/backlog/item-envelope'
import type { BacklogItemId } from '@/domain/ids/ids'
import type { BacklogItemRepository, Clock, TombstoneRepository } from '@/domain/repositories/ports'
import type { Tombstone } from '@/domain/sync/tombstone'

import {
  addBacklogItem,
  deleteBacklogItem,
  listBacklogItems,
  logBacklogProgress,
  updateBacklogItem,
  type BacklogDeps,
} from './items'
import { backlogOverview, dailyGoalBoard } from './overview'
import { exportBacklog, importBacklog } from './transfer'

/**
 * In-memory doubles rather than a database, as everything in this layer
 * is tested. The doubles stamp and bury, because those two behaviours are
 * what the deletion and merge rules depend on — a double that skipped
 * them would let these pass against a repository that never worked.
 */
function harness(at = '2026-08-26T09:00:00.000Z') {
  const store = new Map<string, Item>()
  const graves = new Map<string, Tombstone>()
  let sequence = 0

  const clock: Clock = { now: () => new Date(at) }

  const items: BacklogItemRepository = {
    all: () => Promise.resolve([...store.values()]),
    byId: (id) => Promise.resolve(store.get(id as string)),
    save: (item) => {
      store.set(item.id, { ...item, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (incoming) => {
      for (const item of incoming) store.set(item.id, item)
      return Promise.resolve()
    },
    remove: (id: BacklogItemId) => {
      store.delete(id)
      graves.set(`items:${id as string}`, {
        id,
        collection: 'items',
        deletedAt: clock.now().toISOString(),
      })
      return Promise.resolve()
    },
    purge: (id: BacklogItemId) => {
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
    since: (deletedAt) =>
      Promise.resolve([...graves.values()].filter((one) => one.deletedAt > deletedAt)),
    record: (incoming) => {
      for (const one of incoming) graves.set(`${one.collection}:${one.id}`, one)
      return Promise.resolve()
    },
  }

  const deps: BacklogDeps = {
    items,
    clock,
    ids: {
      next: () => {
        sequence += 1
        return `item-${sequence.toString()}`
      },
    },
  }

  return { deps, items, tombstones, store }
}

describe('adding and editing', () => {
  it('saves a new item and hands it back', async () => {
    const { deps, items } = harness()

    const item = await addBacklogItem({ title: 'Dune', category: 'books' }, deps)

    expect(item.title).toBe('Dune')
    expect(await items.count()).toBe(1)
  })

  it('refuses to edit something that is not there', async () => {
    const { deps } = harness()

    await expect(updateBacklogItem('nope' as BacklogItemId, { title: 'x' }, deps)).rejects.toThrow(
      /No backlog item/,
    )
  })

  it('applies a change and stores the result', async () => {
    const { deps, items } = harness()
    const item = await addBacklogItem({ title: 'Dune', category: 'books' }, deps)

    await updateBacklogItem(item.id, { status: 'currently-using' }, deps)

    expect((await items.byId(item.id))?.status).toBe('currently-using')
  })
})

describe('deleting', () => {
  /*
   * Through `remove`, so a tombstone is written. Deleting an item without
   * recording that it happened is how the other device offers it back as
   * news on its next push, and the two then trade it forever.
   */
  it('records that it happened', async () => {
    const { deps, items, tombstones } = harness()
    const item = await addBacklogItem({ title: 'Dune', category: 'books' }, deps)

    await deleteBacklogItem(item.id, deps)

    expect(await items.count()).toBe(0)
    expect((await tombstones.all()).map((one) => one.id)).toEqual([item.id])
  })
})

describe('listing', () => {
  it('filters and sorts in one pass', async () => {
    const { deps } = harness()
    await addBacklogItem({ title: 'Zeta', category: 'books' }, deps)
    await addBacklogItem({ title: 'Alpha', category: 'books' }, deps)
    await addBacklogItem({ title: 'Mid', category: 'games' }, deps)

    const listed = await listBacklogItems(
      { filters: { category: 'books' }, sortKey: 'alphabetical' },
      deps,
    )

    expect(listed.map((item) => item.title)).toEqual(['Alpha', 'Zeta'])
  })
})

describe('daily progress', () => {
  it('refuses to log against an item with no goal', async () => {
    const { deps } = harness()
    const item = await addBacklogItem({ title: 'Dune', category: 'books' }, deps)

    await expect(logBacklogProgress(item.id, {}, deps)).rejects.toThrow(/no daily goal/)
  })

  it('appends to the log and shows up on the board', async () => {
    const { deps } = harness()
    const item = await addBacklogItem(
      {
        title: 'The Way of Kings',
        category: 'books',
        status: 'currently-using',
        dailyGoal: { amount: 1, unit: 'chapter' },
      },
      deps,
    )

    await logBacklogProgress(item.id, { on: new Date(2026, 7, 26, 20, 0) }, deps)

    const board = await dailyGoalBoard(deps)
    expect(board.statuses[0]?.loggedToday).toBe(1)
    expect(board.metCount).toBe(1)
  })
})

describe('the overview', () => {
  it('derives its numbers rather than storing them', async () => {
    const { deps } = harness()
    await addBacklogItem({ title: 'Dune', category: 'books' }, deps)
    const done = await addBacklogItem({ title: 'Elantris', category: 'books' }, deps)
    await updateBacklogItem(done.id, { status: 'completed' }, deps)

    const { stats } = await backlogOverview(deps)

    expect(stats.totalBacklog).toBe(1)
    expect(stats.completionPercentage).toBe(50)
  })
})

describe('the import path', () => {
  it('round-trips an export', async () => {
    const source = harness()
    await addBacklogItem({ title: 'Dune', category: 'books' }, source.deps)

    const file = await exportBacklog(source)

    const target = harness()
    const result = await importBacklog(file, 'merge', target)

    expect(result).toMatchObject({ imported: 1, rejected: 0, envelopeValid: true })
    expect((await target.items.all())[0]?.title).toBe('Dune')
  })

  /*
   * The bug this whole mechanism exists for, reachable without any sync:
   * export a backup, delete something, import the backup, and it returns —
   * counted as an addition, because that is genuinely what the merge
   * thinks it is.
   */
  it('does not resurrect something deleted since the file was written', async () => {
    const h = harness()
    const item = await addBacklogItem({ title: 'Dune', category: 'books' }, h.deps)
    const file = await exportBacklog(h)

    await deleteBacklogItem(item.id, h.deps)
    const result = await importBacklog(file, 'merge', h)

    expect(result).toMatchObject({ imported: 0, rejected: 1 })
    expect(await h.items.count()).toBe(0)
  })

  it('empties the store on replace and not on merge', async () => {
    const h = harness()
    await addBacklogItem({ title: 'Existing', category: 'games' }, h.deps)

    const incoming = JSON.stringify(
      createItemEnvelope([
        {
          id: 'from-file' as BacklogItemId,
          title: 'From file',
          category: 'books',
          status: 'backlog',
          priority: 'medium',
          tags: [],
          favorite: false,
          dailyProgress: [],
          dateAdded: '2026-01-01T00:00:00.000Z',
        },
      ]),
    )

    await importBacklog(incoming, 'merge', h)
    expect(await h.items.count()).toBe(2)

    await importBacklog(incoming, 'replace', h)
    expect(await h.items.count()).toBe(1)
  })

  /*
   * Nothing was written, and the caller must not read that as "the
   * backlog is now empty" — which is exactly what a parser returning an
   * empty list would have invited.
   */
  it('leaves everything alone when the file is not an envelope', async () => {
    const h = harness()
    await addBacklogItem({ title: 'Existing', category: 'games' }, h.deps)

    const result = await importBacklog('not json at all', 'replace', h)

    expect(result.envelopeValid).toBe(false)
    expect(await h.items.count()).toBe(1)
  })
})
