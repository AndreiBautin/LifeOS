import type { GoalId, GoalItemId, ProjectId } from '@/domain/ids/ids'

/**
 * A complex, multi-branch goal — the shape a "move house" or "change
 * career" actually has once it is written down honestly: several
 * workstreams running in parallel, some of it decided and some of it
 * still a live question, with real dependencies between the two.
 *
 * **This is not a `Campaign`.** A campaign is a single ordered chain of
 * measured or declared stages, read live against Base, Jobs and Finance —
 * right for "the arc", wrong for the thing underneath it. A relocation is
 * not one chain: "where do we want to live" and "can we afford it" and
 * "is the current house ready to sell" run at the same time, one of them
 * can be blocked on a decision nobody has made yet, and most of it is not
 * a number any other screen already tracks. Forcing that into stages
 * would mean either one campaign per workstream (which loses the
 * dependencies between them) or a single chain wearing six unrelated
 * requirement kinds.
 *
 * **This is not a `Project` either, for the same reason a campaign is
 * not.** A project's steps are homogeneous — things to do — and closing
 * one pays XP in its own area. A goal item can be a fact, a hypothesis, a
 * decision or an open question as often as it is an action, and none of
 * those is a thing anybody *does*. Paying XP for deciding where to live
 * would be the outcome/act line this app holds everywhere else, crossed
 * for a decision that is not repeatable and not really an "act" at all.
 * **A goal pays no XP**, on the same footing as a campaign — it is a
 * planning surface, not a scored area, and does not join `LIFE_AREAS`.
 *
 * **What it borrows, deliberately, rather than reinventing.** The
 * dependency graph — `dependsOn`, cycle detection, cascade-clear on
 * delete — is the same shape `domain/projects/blocking.ts` already
 * solved and tested for quest blockers, applied to a graph of typed items
 * instead of a graph of projects. The "ordered but not gated" stance is
 * the one `Campaign` already takes: nothing here refuses a resolution
 * because its dependency is still open, because a screen that policed
 * that would be the app deciding your life for you rather than reporting
 * on it. What changes is what "resolved" means, because unlike a stage
 * there are six kinds of thing to resolve.
 */

export type GoalItemKind = 'fact' | 'hypothesis' | 'decision' | 'question' | 'action' | 'milestone'

export const GOAL_ITEM_KINDS: readonly GoalItemKind[] = [
  'fact',
  'hypothesis',
  'decision',
  'question',
  'action',
  'milestone',
]

export const GOAL_ITEM_KIND_LABELS: Record<GoalItemKind, string> = {
  fact: 'Fact',
  hypothesis: 'Hypothesis',
  decision: 'Decision',
  question: 'Question',
  action: 'Action',
  milestone: 'Milestone',
}

/**
 * What each kind is for, in one line — shown beside the picker, so
 * choosing a kind is not a guess at a taxonomy nobody explained.
 */
export const GOAL_ITEM_KIND_HINTS: Record<GoalItemKind, string> = {
  fact: 'Something already true — a constraint, a number, a given.',
  hypothesis: 'A guess worth testing. Confirm it or rule it out.',
  decision: 'A choice to make, with an answer once it is made.',
  question: 'Something you do not know yet and need to find out.',
  action: 'A thing to go and do, once.',
  milestone: 'A point you will recognise when you reach it.',
}

export interface GoalItem {
  readonly id: GoalItemId
  /**
   * Which parallel branch this belongs to — free text, like `Daily.group`.
   * Grouping is a display concern derived from it, not a second entity:
   * a workstream is a label people choose, not a thing with its own
   * lifecycle to manage.
   */
  readonly workstream: string
  readonly kind: GoalItemKind
  readonly title: string
  readonly notes?: string
  /**
   * Hard dependencies. This item cannot be treated as available until
   * every one of these is resolved — see `isBlocked`. There is no
   * separate "soft" list: a helpful-but-not-blocking relationship is
   * expressed by putting two items in the same workstream, or by saying
   * so in `notes`, rather than by a second kind of edge nothing enforces
   * and everything has to explain.
   */
  readonly dependsOn: readonly GoalItemId[]
  readonly createdAt: string
  /**
   * A real quest doing this item's work, for an action or a milestone.
   * Resolution then follows the quest rather than a separate tick — see
   * `isEffectivelyResolved` — so "declutter the garage" is one record
   * with one checkbox, not a goal item and a quest disagreeing about
   * whether it is done.
   */
  readonly linkedProjectId?: ProjectId

  /** A decision's answer, once made. Absent means undecided. */
  readonly decidedAs?: string
  readonly decidedAt?: string
  /**
   * A hypothesis resolves one of two ways, and both are progress — ruling
   * something out is not a failed hypothesis, it is exactly what testing
   * one is for.
   */
  readonly confirmedAt?: string
  readonly refutedAt?: string
  /** A question's answer, once someone finds it out. */
  readonly answeredAs?: string
  readonly answeredAt?: string
  /** When an action or milestone was reached. */
  readonly completedAt?: string
}

export interface Goal {
  readonly id: GoalId
  readonly name: string
  /** The destination, in a sentence. */
  readonly aim?: string
  readonly items: readonly GoalItem[]
  readonly createdAt: string
  /** Written by the repository, never here. */
  readonly updatedAt?: string
}

/**
 * Whether an item's uncertainty is settled, in whichever direction that
 * kind settles.
 *
 * **A fact is resolved the moment it exists.** It is a recorded given,
 * not a thing anyone works through — treating it as "outstanding" would
 * put constraints on the same board as the choices they constrain, with
 * nothing to tell them apart.
 */
export function isResolved(item: GoalItem): boolean {
  switch (item.kind) {
    case 'fact':
      return true
    case 'decision':
      return item.decidedAt !== undefined
    case 'hypothesis':
      return item.confirmedAt !== undefined || item.refutedAt !== undefined
    case 'question':
      return item.answeredAt !== undefined
    case 'action':
    case 'milestone':
      return item.completedAt !== undefined
  }
}

export function indexItems(items: readonly GoalItem[]): ReadonlyMap<GoalItemId, GoalItem> {
  return new Map(items.map((item) => [item.id, item]))
}

/**
 * What is known about a quest a goal item is linked to — read live from
 * the quest log, the same "evidence gathered live, never copied" stance
 * `Campaign` takes on Base and Jobs. Nothing here is written back onto
 * the goal item.
 */
export interface LinkedProjectInfo {
  readonly id: ProjectId
  readonly name: string
  readonly completed: boolean
}

const NO_LINKS: ReadonlyMap<ProjectId, LinkedProjectInfo> = new Map()

/**
 * Resolved by its own fields, or by the quest it is linked to having
 * closed. The two are never in tension: either is enough, so ticking an
 * item by hand and then linking it later (or the reverse) both land on
 * the same answer rather than one overruling the other.
 */
export function isEffectivelyResolved(
  item: GoalItem,
  linkedProjects: ReadonlyMap<ProjectId, LinkedProjectInfo> = NO_LINKS,
): boolean {
  if (isResolved(item)) return true
  return (
    item.linkedProjectId !== undefined &&
    linkedProjects.get(item.linkedProjectId)?.completed === true
  )
}

/** Whether any hard dependency is still open. */
export function isBlocked(
  item: GoalItem,
  index: ReadonlyMap<GoalItemId, GoalItem>,
  linkedProjects: ReadonlyMap<ProjectId, LinkedProjectInfo> = NO_LINKS,
): boolean {
  return item.dependsOn.some((id) => {
    const dependency = index.get(id)
    return dependency !== undefined && !isEffectivelyResolved(dependency, linkedProjects)
  })
}

export type ItemStanding = 'resolved' | 'blocked' | 'available'

export function standingOf(
  item: GoalItem,
  index: ReadonlyMap<GoalItemId, GoalItem>,
  linkedProjects: ReadonlyMap<ProjectId, LinkedProjectInfo> = NO_LINKS,
): ItemStanding {
  if (isEffectivelyResolved(item, linkedProjects)) return 'resolved'
  return isBlocked(item, index, linkedProjects) ? 'blocked' : 'available'
}

export interface GoalItemStanding {
  readonly item: GoalItem
  readonly standing: ItemStanding
  /** The unresolved dependencies, named, for "waiting on: …". */
  readonly waitingOn: readonly GoalItem[]
  /** Present exactly when `item.linkedProjectId` is, read live. */
  readonly linkedProject?: LinkedProjectInfo
}

export interface Workstream {
  readonly name: string
  readonly items: readonly GoalItemStanding[]
}

export interface GoalStanding {
  readonly goal: Goal
  readonly items: readonly GoalItemStanding[]
  readonly workstreams: readonly Workstream[]
  readonly resolved: number
  readonly total: number
}

/**
 * The goal, read against its own graph.
 *
 * **Nothing here is gated.** A blocked item is *named* as blocked and
 * nothing refuses to resolve it, the same stance a campaign takes on its
 * stages — the order a plan is written in is not always the order things
 * happen in, and a screen that policed that would be managing somebody's
 * life rather than reporting on it.
 */
export function standingFor(
  goal: Goal,
  linkedProjects: ReadonlyMap<ProjectId, LinkedProjectInfo> = NO_LINKS,
): GoalStanding {
  const index = indexItems(goal.items)

  const items: readonly GoalItemStanding[] = goal.items.map((item) => {
    const waitingOn = item.dependsOn.flatMap((id) => {
      const dependency = index.get(id)
      return dependency !== undefined && !isEffectivelyResolved(dependency, linkedProjects)
        ? [dependency]
        : []
    })

    const linkedProject =
      item.linkedProjectId === undefined ? undefined : linkedProjects.get(item.linkedProjectId)

    return {
      item,
      standing: standingOf(item, index, linkedProjects),
      waitingOn,
      ...(linkedProject === undefined ? {} : { linkedProject }),
    }
  })

  return {
    goal,
    items,
    workstreams: byWorkstream(items),
    resolved: items.filter((one) => one.standing === 'resolved').length,
    total: items.length,
  }
}

/**
 * Grouped by workstream, in the order each workstream first appeared —
 * never alphabetically. The same call `byGroup` makes for a day's
 * habits: the order is already meaningful, because it is the order
 * somebody wrote the plan in, and re-sorting it by name would scramble a
 * sequence somebody chose on purpose.
 */
export function byWorkstream(items: readonly GoalItemStanding[]): readonly Workstream[] {
  const order: string[] = []
  const groups = new Map<string, GoalItemStanding[]>()

  for (const entry of items) {
    const key = entry.item.workstream
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key)?.push(entry)
  }

  return order.map((name) => ({ name, items: groups.get(name) ?? [] }))
}

/**
 * Whether `from` already depends on `target`, directly or through a
 * chain.
 *
 * The same breadth-first walk with a visited set that
 * `domain/projects/blocking.ts` uses for quest blockers, over a graph of
 * goal items instead of projects. A cycle in a dependency graph is a
 * cycle whichever kind of node it is drawn between; the walk does not
 * care what an item's `kind` is.
 */
export function dependsOnTransitively(
  index: ReadonlyMap<GoalItemId, GoalItem>,
  from: GoalItemId,
  target: GoalItemId,
): boolean {
  const visited = new Set<GoalItemId>()
  const queue: GoalItemId[] = [from]

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || visited.has(current)) continue
    visited.add(current)

    if (current === target) return true

    const item = index.get(current)
    if (item !== undefined) queue.push(...item.dependsOn)
  }

  return false
}

/**
 * Why a proposed dependency cannot be added, or `undefined` if it can.
 *
 * A message rather than a thrown error, for the reason `validateBlockers`
 * gives: this is something a person asked for on purpose, and "that would
 * create a circular dependency" is a sentence they need read back to
 * them rather than an exception.
 */
export function validateDependency(
  items: readonly GoalItem[],
  itemId: GoalItemId,
  dependsOnId: GoalItemId,
): string | undefined {
  if (dependsOnId === itemId) return 'An item cannot depend on itself.'

  const index = indexItems(items)
  if (!index.has(itemId) || !index.has(dependsOnId)) return 'Unknown item.'

  // If dependsOnId already depends on itemId, adding "itemId depends on
  // dependsOnId" closes the loop.
  if (dependsOnTransitively(index, dependsOnId, itemId)) {
    return 'That would create a circular dependency.'
  }

  return undefined
}

function mapItem(goal: Goal, itemId: GoalItemId, change: (item: GoalItem) => GoalItem): Goal {
  return {
    ...goal,
    items: goal.items.map((item) => (item.id === itemId ? change(item) : item)),
  }
}

/** Adds an item that cannot yet be a cycle risk — nothing can depend on an id that did not exist a moment ago. */
export function addItem(goal: Goal, item: GoalItem): Goal {
  return { ...goal, items: [...goal.items, item] }
}

export function decideItem(goal: Goal, itemId: GoalItemId, decidedAs: string, at: string): Goal {
  const trimmed = decidedAs.trim()
  if (trimmed === '') return goal

  return mapItem(goal, itemId, (item) => ({ ...item, decidedAs: trimmed, decidedAt: at }))
}

export function confirmHypothesis(goal: Goal, itemId: GoalItemId, at: string): Goal {
  return mapItem(goal, itemId, (item) => {
    const { refutedAt: _refutedAt, ...rest } = item
    return { ...rest, confirmedAt: at }
  })
}

export function refuteHypothesis(goal: Goal, itemId: GoalItemId, at: string): Goal {
  return mapItem(goal, itemId, (item) => {
    const { confirmedAt: _confirmedAt, ...rest } = item
    return { ...rest, refutedAt: at }
  })
}

export function answerQuestion(
  goal: Goal,
  itemId: GoalItemId,
  answeredAs: string,
  at: string,
): Goal {
  const trimmed = answeredAs.trim()
  if (trimmed === '') return goal

  return mapItem(goal, itemId, (item) => ({ ...item, answeredAs: trimmed, answeredAt: at }))
}

export function completeItem(goal: Goal, itemId: GoalItemId, at: string): Goal {
  return mapItem(goal, itemId, (item) => ({ ...item, completedAt: at }))
}

/**
 * Undoes whichever resolution an item carries, regardless of kind.
 *
 * One function rather than four, because the shape is identical: new
 * evidence can turn a decided, confirmed, refuted, answered or completed
 * item back into an open one, and the item does not need to say which of
 * those it currently is for the caller to ask for it back. A fact has no
 * resolution fields to clear, so this is a no-op on one — which is
 * correct rather than a case to special-case away.
 */
export function reopenItem(goal: Goal, itemId: GoalItemId): Goal {
  return mapItem(goal, itemId, (item) => {
    const {
      decidedAs: _decidedAs,
      decidedAt: _decidedAt,
      confirmedAt: _confirmedAt,
      refutedAt: _refutedAt,
      answeredAs: _answeredAs,
      answeredAt: _answeredAt,
      completedAt: _completedAt,
      ...rest
    } = item
    return rest
  })
}

/**
 * Removes an item and strips it from every other item's `dependsOn`.
 *
 * The cascade `withoutBlocker` does for a deleted quest, applied here:
 * without it, a reference to a deleted item sits in the record forever,
 * travels over sync, and reappears as a dependency the moment some other
 * item is created with the same id.
 */
export function removeItem(goal: Goal, itemId: GoalItemId): Goal {
  return {
    ...goal,
    items: goal.items.flatMap((item) => {
      if (item.id === itemId) return []
      if (!item.dependsOn.includes(itemId)) return [item]
      return [{ ...item, dependsOn: item.dependsOn.filter((id) => id !== itemId) }]
    }),
  }
}

export function setDependencies(
  goal: Goal,
  itemId: GoalItemId,
  dependsOn: readonly GoalItemId[],
): Goal {
  return mapItem(goal, itemId, (item) => ({ ...item, dependsOn }))
}

/** Points an action or milestone at the quest doing its work. */
export function linkToProject(goal: Goal, itemId: GoalItemId, projectId: ProjectId): Goal {
  return mapItem(goal, itemId, (item) => ({ ...item, linkedProjectId: projectId }))
}

export function unlinkFromProject(goal: Goal, itemId: GoalItemId): Goal {
  return mapItem(goal, itemId, (item) => {
    const { linkedProjectId: _linkedProjectId, ...rest } = item
    return rest
  })
}

/**
 * An item's title, workstream and notes, in one write — the label edit
 * `renameStage`/`relabelDaily` already offer everywhere else. Nothing
 * about what the item means or what it depends on changes; a blank
 * title or workstream is refused rather than silently kept, the same
 * "ignore rather than half-apply" stance the goal's own rename takes.
 */
export function renameItem(
  goal: Goal,
  itemId: GoalItemId,
  title: string,
  workstream: string,
  notes: string,
): Goal {
  const trimmedTitle = title.trim()
  const trimmedWorkstream = workstream.trim()
  if (trimmedTitle === '' || trimmedWorkstream === '') return goal

  const trimmedNotes = notes.trim()

  return mapItem(goal, itemId, (item) => {
    const { notes: _notes, ...rest } = item
    return {
      ...rest,
      title: trimmedTitle,
      workstream: trimmedWorkstream,
      ...(trimmedNotes === '' ? {} : { notes: trimmedNotes }),
    }
  })
}

/**
 * The first available item, in the order items were added.
 *
 * The same "earliest outstanding, highlighted rather than moved" rule
 * `Campaign` already uses for its own `next` — a later item can be met
 * first, and the position that matters is the earliest one still
 * waiting, not whichever was worked on most recently. A goal with
 * everything resolved or blocked has nothing to name, which is the
 * honest reading of "no available next step" and not a case to route
 * around: a readout that invented a step here would be the app telling
 * somebody what to do next on a screen whose whole point is that it
 * does not.
 */
export function nextAvailableItem(standing: GoalStanding): GoalItemStanding | undefined {
  return standing.items.find((entry) => entry.standing === 'available')
}

/**
 * Renames a workstream across every item that carries it, in one write.
 *
 * A workstream is free text on each item rather than a record of its
 * own — see `GoalItem.workstream` — so there is nothing to rename except
 * the string every item with the old name happens to share. Matched
 * exactly rather than trimmed or cased, because `byWorkstream` groups on
 * the raw value and a looser match here would rename items a grouping
 * pass would not have considered the same workstream.
 */
export function renameWorkstream(goal: Goal, from: string, to: string): Goal {
  const trimmed = to.trim()
  if (trimmed === '' || trimmed === from) return goal

  return {
    ...goal,
    items: goal.items.map((item) =>
      item.workstream === from ? { ...item, workstream: trimmed } : item,
    ),
  }
}

/** Renames the goal, and its aim. Both are labels. */
export function renameGoal(goal: Goal, name: string, aim: string): Goal {
  const trimmedName = name.trim()
  if (trimmedName === '') return goal

  const trimmedAim = aim.trim()

  // Dropped from the spread rather than set to undefined: a key holding
  // undefined is a key, and it would travel over sync as one.
  const { aim: _cleared, ...rest } = goal

  return { ...rest, name: trimmedName, ...(trimmedAim === '' ? {} : { aim: trimmedAim }) }
}
