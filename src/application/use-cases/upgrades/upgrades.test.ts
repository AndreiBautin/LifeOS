import { describe, expect, it } from 'vitest'

import { asUpgradeId, type UpgradeId } from '@/domain/ids/ids'
import type { Clock, TombstoneRepository, UpgradeRepository } from '@/domain/repositories/ports'
import type { Tombstone } from '@/domain/sync/tombstone'
import type { Upgrade } from '@/domain/upgrades/upgrade'

import {
  addUpgrade,
  deleteUpgrade,
  updateUpgrade,
  upgradeTree,
  type UpgradeDeps,
  type UpgradeResult,
} from './upgrades'

/**
 * The two refusals are what these are for.
 *
 * Both used to have the database standing behind them — a self-referencing
 * foreign key with `DeleteBehavior.Restrict`, and a cycle check that was
 * belt to its braces. Neither survives IndexedDB, so these tests are the
 * whole guard.
 */
function harness(at = '2026-08-26T09:00:00.000Z') {
  const store = new Map<string, Upgrade>()
  const graves = new Map<string, Tombstone>()
  let sequence = 0

  const clock: Clock = { now: () => new Date(at) }

  const upgrades: UpgradeRepository = {
    all: () => Promise.resolve([...store.values()]),
    byId: (id) => Promise.resolve(store.get(id as string)),
    save: (upgrade) => {
      store.set(upgrade.id, { ...upgrade, updatedAt: clock.now().toISOString() })
      return Promise.resolve()
    },
    restoreMany: (incoming) => {
      for (const upgrade of incoming) store.set(upgrade.id, upgrade)
      return Promise.resolve()
    },
    remove: (id: UpgradeId) => {
      store.delete(id)
      graves.set(`upgrades:${id as string}`, {
        id,
        collection: 'upgrades',
        deletedAt: clock.now().toISOString(),
      })
      return Promise.resolve()
    },
    purge: (id: UpgradeId) => {
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

  const deps: UpgradeDeps = {
    upgrades,
    clock,
    ids: {
      next: () => {
        sequence += 1
        return `upgrade-${sequence.toString()}`
      },
    },
  }

  return { deps, upgrades, tombstones }
}

async function required(promise: Promise<UpgradeResult>): Promise<Upgrade> {
  const result = await promise
  if (result.upgrade === undefined) throw new Error(result.error)
  return result.upgrade
}

describe('adding', () => {
  it('starts as an idea at middling priority', async () => {
    const { deps } = harness()

    const upgrade = await required(addUpgrade({ title: '  Standing desk  ' }, deps))

    expect(upgrade).toMatchObject({
      title: 'Standing desk',
      category: 'other',
      priority: 50,
      status: 'idea',
    })
  })

  it('holds priority inside 1–100', async () => {
    const { deps } = harness()

    expect((await required(addUpgrade({ title: 'A', priority: 900 }, deps))).priority).toBe(100)
    expect((await required(addUpgrade({ title: 'B', priority: -4 }, deps))).priority).toBe(1)
  })

  it('refuses a prerequisite that does not exist', async () => {
    const { deps } = harness()

    const result = await addUpgrade({ title: 'Arm', prerequisiteId: asUpgradeId('ghost') }, deps)

    expect(result.error).toMatch(/does not exist/)
  })
})

describe('editing', () => {
  /*
   * The cycle guard, with nothing behind it. A loop here is not merely
   * wrong data — it is a tree that cannot be drawn and a priority walk
   * that has to defend itself.
   */
  it('refuses a prerequisite that would close a loop', async () => {
    const { deps, upgrades } = harness()
    const desk = await required(addUpgrade({ title: 'Desk' }, deps))
    const arm = await required(addUpgrade({ title: 'Arm', prerequisiteId: desk.id }, deps))

    const result = await updateUpgrade(desk.id, { prerequisiteId: arm.id }, deps)

    expect(result.error).toMatch(/cycle/)
    expect((await upgrades.byId(desk.id))?.prerequisiteId).toBeUndefined()
  })

  it('accepts an unrelated prerequisite', async () => {
    const { deps } = harness()
    const desk = await required(addUpgrade({ title: 'Desk' }, deps))
    const arm = await required(addUpgrade({ title: 'Arm' }, deps))

    const result = await updateUpgrade(arm.id, { prerequisiteId: desk.id }, deps)

    expect(result.upgrade?.prerequisiteId).toBe(desk.id)
  })

  /*
   * An absent field means "leave it alone" and `null` means "remove it".
   * Collapsing the two makes detaching a node from the tree impossible, or
   * makes every edit detach it.
   */
  it('detaches on null and leaves the parent alone when absent', async () => {
    const { deps } = harness()
    const desk = await required(addUpgrade({ title: 'Desk' }, deps))
    const arm = await required(addUpgrade({ title: 'Arm', prerequisiteId: desk.id }, deps))

    const renamed = await required(updateUpgrade(arm.id, { title: 'Monitor arm' }, deps))
    expect(renamed.prerequisiteId).toBe(desk.id)

    const detached = await required(updateUpgrade(arm.id, { prerequisiteId: null }, deps))
    expect('prerequisiteId' in detached).toBe(false)
  })

  it('records when something was bought', async () => {
    const { deps } = harness()
    const desk = await required(addUpgrade({ title: 'Desk' }, deps))

    const bought = await required(updateUpgrade(desk.id, { status: 'purchased' }, deps))

    expect(bought.purchasedAt).toBe('2026-08-26T09:00:00.000Z')
  })

  it('clears an estimate on null', async () => {
    const { deps } = harness()
    const desk = await required(
      addUpgrade({ title: 'Desk', estimatedCostMinorUnits: 40_000 }, deps),
    )

    const cleared = await required(updateUpgrade(desk.id, { estimatedCostMinorUnits: null }, deps))

    expect('estimatedCostMinorUnits' in cleared).toBe(false)
  })
})

describe('deleting', () => {
  /*
   * The other refusal the database used to back, via `Restrict` on the
   * self-referencing key. Detaching the dependents silently would be the
   * app rearranging a tree somebody built on purpose.
   */
  it('refuses while something still depends on it, and names what', async () => {
    const { deps, upgrades } = harness()
    const desk = await required(addUpgrade({ title: 'Desk' }, deps))
    await addUpgrade({ title: 'Monitor arm', prerequisiteId: desk.id }, deps)

    const result = await deleteUpgrade(desk.id, deps)

    expect(result.error).toMatch(/Monitor arm/)
    expect(await upgrades.count()).toBe(2)
  })

  it('deletes a leaf and records that it happened', async () => {
    const { deps, upgrades, tombstones } = harness()
    const lamp = await required(addUpgrade({ title: 'Lamp' }, deps))

    expect(await deleteUpgrade(lamp.id, deps)).toEqual({})
    expect(await upgrades.count()).toBe(0)
    expect((await tombstones.all()).map((one) => one.id)).toEqual([lamp.id])
  })

  it('deletes once the dependent has been unlinked', async () => {
    const { deps } = harness()
    const desk = await required(addUpgrade({ title: 'Desk' }, deps))
    const arm = await required(addUpgrade({ title: 'Arm', prerequisiteId: desk.id }, deps))

    await updateUpgrade(arm.id, { prerequisiteId: null }, deps)

    expect(await deleteUpgrade(desk.id, deps)).toEqual({})
  })
})

describe('the tree with a budget', () => {
  /*
   * The whole point, end to end: a dull desk inherits the priority of the
   * arm it unblocks, and today's money says which of them can be acted on.
   */
  it('inherits priority up the chain and marks what today can reach', async () => {
    const { deps } = harness()
    const desk = await required(
      addUpgrade({ title: 'Desk', priority: 70, estimatedCostMinorUnits: 40_000 }, deps),
    )
    await addUpgrade(
      { title: 'Arm', priority: 92, prerequisiteId: desk.id, estimatedCostMinorUnits: 9_000 },
      deps,
    )

    const tree = await upgradeTree(50_000, deps)

    expect(tree.map((entry) => entry.recommendation.effectivePriority)).toEqual([92, 92])
    expect(tree.find((entry) => entry.upgrade.id === desk.id)?.affordable).toBe(true)

    const armEntry = tree.find((entry) => entry.upgrade.title === 'Arm')
    expect(armEntry?.affordable).toBe(false)
    expect(armEntry?.recommendation.isBlocked).toBe(true)
  })

  it('opens the arm once the desk is bought', async () => {
    const { deps } = harness()
    const desk = await required(
      addUpgrade({ title: 'Desk', priority: 70, estimatedCostMinorUnits: 40_000 }, deps),
    )
    await addUpgrade(
      { title: 'Arm', priority: 92, prerequisiteId: desk.id, estimatedCostMinorUnits: 9_000 },
      deps,
    )

    await updateUpgrade(desk.id, { status: 'purchased' }, deps)

    const tree = await upgradeTree(50_000, deps)
    const armEntry = tree.find((entry) => entry.upgrade.title === 'Arm')

    expect(armEntry?.recommendation.isBlocked).toBe(false)
    expect(armEntry?.affordable).toBe(true)
  })
})
