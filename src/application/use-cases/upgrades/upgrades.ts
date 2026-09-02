import { keepFor, type HomeFilter, type RecordHome } from '@/domain/base/base'
import { homeForShelf, shelfOf, type UpgradeShelf } from '@/domain/upgrades/shelf'
import { asUpgradeId, type IdGenerator, type UpgradeId } from '@/domain/ids/ids'
import type { Clock, FinanceRepository, UpgradeRepository } from '@/domain/repositories/ports'
import { spendingPool, type SpendingPool } from '@/domain/upgrades/pool'
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

/** The pool spans two areas, so it takes both repositories and no clock. */
export interface PoolDeps {
  readonly upgrades: UpgradeRepository
  readonly finance: FinanceRepository
}

export interface NewUpgrade {
  readonly title: string
  /**
   * Which area the upgrade is filed under. Absent means the tech tree.
   *
   * Here rather than as a separate move because the workflow otherwise
   * runs the wrong way round: adding a dishwasher meant opening the tech
   * tree, typing it among the barbells, and coming back to Base to move
   * it. **The record is shared on purpose and the screens are not** —
   * one wallet and one set of gates, entered wherever you were standing.
   */
  readonly belongsTo?: RecordHome
  /**
   * Which shelf it is born on. Absent means the tech tree.
   *
   * Supersedes `belongsTo` when both are given, because it is the finer
   * answer and the one the screens read — `addUpgrade` derives the area
   * from it so the two cannot be created disagreeing.
   */
  readonly shelf?: UpgradeShelf
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
  /*
   * The shelf is the finer answer and wins when both are given, so the
   * two can never be created disagreeing about the house.
   */
  const bornIn = input.shelf === undefined ? input.belongsTo : homeForShelf(input.shelf)

  const upgrade: Upgrade = {
    id: asUpgradeId(deps.ids.next()),
    title: input.title.trim(),
    ...(input.description === undefined ? {} : { description: input.description }),
    category: input.category ?? 'other',
    // Born on the shelf that created it. Without this the Gear screen's
    // own add form would make a tech-tree row and need a move straight
    // after — the round trip already removed from chores, upgrades and
    // house jobs, reappearing on the newest screen.
    ...(input.shelf === undefined ? {} : { shelf: input.shelf }),
    ...(bornIn === undefined ? {} : { belongsTo: bornIn }),
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
 * The tree for one shelf.
 *
 * Ranked over that shelf alone, which is what makes three screens
 * useful rather than three filters of one list: the priority order on
 * the gear shelf should not be disturbed by a graphics card.
 *
 * The gates are still global — a prerequisite may sit on another shelf,
 * because "the desk before the monitor arm" is a real dependency that
 * crosses them. `rankTree` is given the whole set to resolve against
 * and the entries are narrowed afterwards, or a cross-shelf parent
 * would read as missing.
 */
/**
 * The whole tree, every shelf at once, ranked together.
 *
 * **This is what the tech tree screen draws now**, where it used to draw
 * one shelf at a time behind a toggle: the shelves are branches of one
 * picture, so narrowing to a shelf would leave a branch with nothing on
 * it and a cross-branch prerequisite pointing off the canvas.
 *
 * Ranked over the whole set rather than per shelf, which is the one
 * thing `shelfTree` deliberately does differently — its note explains
 * why a graphics card should not disturb the order of the boots. Here
 * there is one order because there is one tree, and the layout puts each
 * node under its own branch regardless of where it ranks.
 */
export async function wholeTree(
  availableMinorUnits: number,
  deps: UpgradeDeps,
): Promise<readonly TreeEntry[]> {
  return rankTree(await deps.upgrades.all(), availableMinorUnits)
}

export async function shelfTree(
  shelf: UpgradeShelf,
  availableMinorUnits: number,
  deps: UpgradeDeps,
): Promise<readonly TreeEntry[]> {
  const all = await deps.upgrades.all()

  return rankTree(all, availableMinorUnits).filter((entry) => shelfOf(entry.upgrade) === shelf)
}

/**
 * Moves an upgrade to a shelf.
 *
 * **One write setting both fields**, which is the `reshapeStage` lesson:
 * `shelf` and `belongsTo` are two answers about one record, and sending
 * them as two read-modify-writes loses one of them. `belongsTo` stays
 * the area answer because `baseContents`, `keepFor` and the "exactly
 * one side" test all read it; `shelf` is the finer answer only upgrades
 * have. They cannot disagree if only one function sets them.
 *
 * A move, not a create-and-delete — the record keeps its price, its
 * priority, its prerequisite and anything that depends on it.
 */
export async function moveUpgradeToShelf(
  id: UpgradeId,
  shelf: UpgradeShelf,
  deps: UpgradeDeps,
): Promise<void> {
  const existing = (await deps.upgrades.all()).find((upgrade) => upgrade.id === id)
  if (existing === undefined) return

  const home = homeForShelf(shelf)
  // Dropped rather than set to undefined: under exactOptionalPropertyTypes
  // an absent field and one set to undefined are different things, and
  // only the first means "its own area".
  const { belongsTo: _dropped, ...rest } = existing

  await deps.upgrades.save({
    ...rest,
    shelf,
    ...(home === undefined ? {} : { belongsTo: home }),
  })
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

/**
 * What there is to spend, read from the records that already exist.
 *
 * The pool is derived — every surplus ever recorded, minus what the
 * purchased upgrades cost — so this loads both sides and hands them to
 * `spendingPool`. Nothing stores a balance; see `domain/upgrades/pool.ts`
 * for why a running total was the obvious build and the wrong one.
 */
export async function readSpendingPool(deps: PoolDeps): Promise<SpendingPool> {
  const [readings, upgrades] = await Promise.all([deps.finance.all(), deps.upgrades.all()])

  return spendingPool(readings, upgrades)
}
