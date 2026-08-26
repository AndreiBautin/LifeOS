import type { CategoryId } from './category-registry'
import type { Item } from './item'
import { PRIORITY_RANK } from './priority'

export interface DashboardSections {
  readonly continue: readonly Item[]
  /** The best backlog pick per category, so one category cannot crowd out the rest. */
  readonly startNext: readonly Item[]
  readonly recentlyFinished: readonly Item[]
  readonly recentlyAdded: readonly Item[]
}

const DEFAULT_LIMIT = 5

/**
 * An absent `updatedAt` sorts last.
 *
 * The stamp is written by the repository on save, so a record without one
 * has never been through that path — it is as old as anything here can be,
 * and ordering it first would put an unwritten record at the top of
 * "recently touched".
 */
function byDateDesc(getDate: (item: Item) => string | undefined) {
  return (a: Item, b: Item) => (getDate(b) ?? '').localeCompare(getDate(a) ?? '')
}

function byPriorityThenAge(a: Item, b: Item): number {
  const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  return rankDiff !== 0 ? rankDiff : a.dateAdded.localeCompare(b.dateAdded)
}

/**
 * Picks the strongest backlog candidate in each category, then ranks those
 * picks against each other. Deliberately not capped by `limit`: one entry per
 * category is already a natural bound, and slicing would drop whole categories.
 */
function getStartNext(items: readonly Item[]): readonly Item[] {
  const bestByCategory = new Map<CategoryId, Item>()

  for (const item of items) {
    if (item.status !== 'backlog') {
      continue
    }
    const incumbent = bestByCategory.get(item.category)
    if (!incumbent || byPriorityThenAge(item, incumbent) < 0) {
      bestByCategory.set(item.category, item)
    }
  }

  return [...bestByCategory.values()].sort(byPriorityThenAge)
}

/** Answers "what should I consume next?" from a snapshot of items. */
export function getDashboardSections(
  items: readonly Item[],
  limit = DEFAULT_LIMIT,
): DashboardSections {
  const inProgress = items
    .filter((item) => item.status === 'currently-using')
    .sort(byDateDesc((item) => item.updatedAt))
    .slice(0, limit)

  const recentlyFinished = items
    .filter((item) => item.status === 'completed')
    .sort(byDateDesc((item) => item.dateCompleted ?? item.updatedAt))
    .slice(0, limit)

  const recentlyAdded = [...items].sort(byDateDesc((item) => item.dateAdded)).slice(0, limit)

  return {
    continue: inProgress,
    startNext: getStartNext(items),
    recentlyFinished,
    recentlyAdded,
  }
}
