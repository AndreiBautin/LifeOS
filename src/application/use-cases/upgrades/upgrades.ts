import { asUpgradeId, type IdGenerator, type UpgradeId } from '@/domain/ids/ids'
import type { Clock, UpgradeRepository } from '@/domain/repositories/ports'
import {
  dependentsOf,
  rankTree,
  wouldCreateCycle,
  type TreeEntry,
} from '@/domain/upgrades/recommendation'
import {
  MAX_PRIORITY,
  MIN_PRIORITY,
  type Upgrade,
  type UpgradeCategory,
  type UpgradeStatus,
} from '@/domain/upgrades/upgrade'

/**
 * The tech tree's operations.
 *
 * Two of these refuse things, and both refusals used to have a database
 * behind them as well as code — a self-referencing foreign key with
 * `DeleteBehavior.Restrict`, and a cycle check that was belt to its
 * braces. Neither survives IndexedDB, so what is here is the whole of it.
 *
 * Both return a message rather than throwing. Every way to hit one is
 * something a person did on purpose, and "that would create a dependency
 * cycle" is a sentence they need to read.
 */

export interface UpgradeDeps {
  readonly upgrades: UpgradeRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface NewUpgrade {
  readonly title: string
  readonly description?: string
  readonly category?: UpgradeCategory
  readonly priority?: number
  readonly estimatedCostMinorUnits?: number
  readonly status?: UpgradeStatus
  readonly notes?: string
  readonly productLink?: string
  readonly prerequisiteId?: UpgradeId
}

/** Held to 1–100 here, because nothing downstream checks it. */
function clampPriority(priority: number): number {
  if (!Number.isFinite(priority)) return 50
  return Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, Math.round(priority)))
}

export type UpgradeResult =
  | { readonly upgrade: Upgrade; readonly error?: undefined }
  | { readonly upgrade?: undefined; readonly error: string }

export async function addUpgrade(input: NewUpgrade, deps: UpgradeDeps): Promise<UpgradeResult> {
  const all = await deps.upgrades.all()

  if (input.prerequisiteId !== undefined && !all.some((one) => one.id === input.prerequisiteId)) {
    return { error: 'That prerequisite does not exist.' }
  }

  /*
   * A brand-new node has no dependents, so it cannot close a loop. The
   * cycle check is only needed on update — which is the one place the
   * original put it too.
   */
  const upgrade: Upgrade = {
    id: asUpgradeId(deps.ids.next()),
    title: input.title.trim(),
    ...(input.description === undefined ? {} : { description: input.description }),
    category: input.category ?? 'other',
    priority: clampPriority(input.priority ?? 50),
    ...(input.estimatedCostMinorUnits === undefined
      ? {}
      : { estimatedCostMinorUnits: input.estimatedCostMinorUnits }),
    status: input.status ?? 'idea',
    ...(input.notes === undefined ? {} : { notes: input.notes }),
    ...(input.productLink === undefined ? {} : { productLink: input.productLink }),
    ...(input.prerequisiteId === undefined ? {} : { prerequisiteId: input.prerequisiteId }),
    createdAt: deps.clock.now().toISOString(),
  }

  await deps.upgrades.save(upgrade)
  return { upgrade }
}

export interface UpgradeChanges {
  readonly title?: string
  readonly description?: string
  readonly category?: UpgradeCategory
  readonly priority?: number
  /** `null` clears the estimate; absent leaves it alone. */
  readonly estimatedCostMinorUnits?: number | null
  readonly status?: UpgradeStatus
  readonly notes?: string
  readonly productLink?: string
  /** `null` detaches from the tree; absent leaves the parent alone. */
  readonly prerequisiteId?: UpgradeId | null
}

export async function updateUpgrade(
  id: UpgradeId,
  changes: UpgradeChanges,
  deps: UpgradeDeps,
): Promise<UpgradeResult> {
  const all = await deps.upgrades.all()
  const existing = all.find((one) => one.id === id)
  if (existing === undefined) return { error: 'That upgrade no longer exists.' }

  if (changes.prerequisiteId != null) {
    if (!all.some((one) => one.id === changes.prerequisiteId)) {
      return { error: 'That prerequisite does not exist.' }
    }

    if (wouldCreateCycle(all, id, changes.prerequisiteId)) {
      return { error: 'That prerequisite would create a dependency cycle.' }
    }
  }

  const buying = changes.status === 'purchased' && existing.status !== 'purchased'

  const { prerequisiteId: _prerequisiteId, estimatedCostMinorUnits: _estimate, ...rest } = existing

  const updated: Upgrade = {
    ...rest,
    ...(changes.title === undefined ? {} : { title: changes.title.trim() }),
    ...(changes.description === undefined ? {} : { description: changes.description }),
    ...(changes.category === undefined ? {} : { category: changes.category }),
    ...(changes.priority === undefined ? {} : { priority: clampPriority(changes.priority) }),
    ...(changes.status === undefined ? {} : { status: changes.status }),
    ...(changes.notes === undefined ? {} : { notes: changes.notes }),
    ...(changes.productLink === undefined ? {} : { productLink: changes.productLink }),
    ...(changes.prerequisiteId === null
      ? {}
      : { prerequisiteId: changes.prerequisiteId ?? existing.prerequisiteId }),
    ...(changes.estimatedCostMinorUnits === null
      ? {}
      : {
          estimatedCostMinorUnits:
            changes.estimatedCostMinorUnits ?? existing.estimatedCostMinorUnits,
        }),
    ...(buying ? { purchasedAt: deps.clock.now().toISOString() } : {}),
  }

  await deps.upgrades.save(stripUndefined(updated))
  return { upgrade: stripUndefined(updated) }
}

/**
 * Removes keys a conditional spread left as an explicit `undefined`.
 *
 * `exactOptionalPropertyTypes` treats that as different from an absent
 * key and IndexedDB stores the difference, so an upgrade whose estimate
 * was cleared would come back carrying `estimatedCostMinorUnits:
 * undefined` and read as having one.
 */
function stripUndefined(upgrade: Upgrade): Upgrade {
  return Object.fromEntries(
    Object.entries(upgrade).filter(([, value]) => value !== undefined),
  ) as unknown as Upgrade
}

/**
 * Deletes, refusing while anything still points at it.
 *
 * The source refused for the same reason and had a foreign key behind it,
 * which turned a missed check into a constraint violation rather than a
 * dangling reference. Nothing catches it now, so the refusal is the whole
 * guard — and refusing is the right call over silently detaching the
 * dependents, because "unlink these first" is a decision about a tree
 * somebody built on purpose.
 */
export async function deleteUpgrade(
  id: UpgradeId,
  deps: UpgradeDeps,
): Promise<{ readonly error?: string }> {
  const all = await deps.upgrades.all()

  const dependents = dependentsOf(all, id)
  if (dependents.length > 0) {
    const names = all
      .filter((one) => dependents.includes(one.id))
      .map((one) => one.title)
      .join(', ')

    return { error: `Unlink what depends on this first: ${names}.` }
  }

  await deps.upgrades.remove(id)
  return {}
}

/** The tree, ranked, with today's budget applied. */
export async function upgradeTree(
  availableMinorUnits: number,
  deps: UpgradeDeps,
): Promise<readonly TreeEntry[]> {
  return rankTree(await deps.upgrades.all(), availableMinorUnits)
}

export async function listUpgrades(deps: UpgradeDeps): Promise<readonly Upgrade[]> {
  return deps.upgrades.all()
}
