import { keepFor, type HomeFilter, type RecordHome } from '@/domain/base/base'
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
/**
 * The tree, for one side of the Base split.
 *
 * Ranked *after* filtering rather than before, which is the load-bearing
 * order: `rankTree` promotes an upgrade that unblocks others, and a
 * prerequisite chain that crosses the split would otherwise let a house
 * upgrade raise a gear upgrade's rank on a screen that never shows it.
 * Each side ranks against itself.
 *
 * The cost, stated because it is a real one: a chain that genuinely
 * crosses — a workbench in the garage that a lifting rack depends on —
 * is now two chains that cannot see each other, and the dependent will
 * read as unblocked. Keep such pairs on the same side.
 */
export async function upgradeTree(
  availableMinorUnits: number,
  deps: UpgradeDeps,
  home: HomeFilter,
): Promise<readonly TreeEntry[]> {
  return rankTree(keepFor(await deps.upgrades.all(), home), availableMinorUnits)
}

/**
 * Moves a record between Base and its own area.
 *
 * A *move*, not a create-and-delete, and that is the whole reason this
 * exists rather than a checkbox on the add form. The common case is a
 * quest log that has quietly filled up with house work — the leaking tap
 * has been on the list for a month, with its steps and its history — and
 * retyping it into a new home would throw away the part that took effort
 * to record.
 *
 * One field changes. Nothing about the record's identity, steps or
 * completions moves with it, so XP already earned stays earned in
 * whichever area paid it: `tallyActs` reads the *current* home, and a
 * quest moved to Base today stops paying `projects.*` from today. That is
 * the honest reading of a reclassification — you have not un-done the
 * work, you have changed what it is filed under — and it is the same
 * trade `completedAsKind` makes for main and side quests, in the other
 * direction, for the same reason.
 */
export async function moveUpgradeHome(
  id: UpgradeId,
  home: RecordHome | undefined,
  deps: UpgradeDeps,
): Promise<void> {
  const existing = (await deps.upgrades.all()).find((upgrade) => upgrade.id === id)
  if (existing === undefined) return

  const { belongsTo: _dropped, ...rest } = existing

  await deps.upgrades.save(home === undefined ? rest : { ...rest, belongsTo: home })
}

export async function listUpgrades(
  deps: UpgradeDeps,
  home: HomeFilter,
): Promise<readonly Upgrade[]> {
  return keepFor(await deps.upgrades.all(), home)
}
