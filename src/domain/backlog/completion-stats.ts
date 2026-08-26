import { CATEGORY_REGISTRY, type CategoryId } from './category-registry'
import type { Item } from './item'

export interface CompletionStats {
  readonly totalBacklog: number
  readonly completedThisMonth: number
  readonly completedThisYear: number
  readonly completionPercentage: number
  readonly itemsByCategory: Readonly<Record<CategoryId, number>>
}

function isSameMonth(isoDate: string, now: Date): boolean {
  const date = new Date(isoDate)
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth()
}

function isSameYear(isoDate: string, now: Date): boolean {
  return new Date(isoDate).getUTCFullYear() === now.getUTCFullYear()
}

/** Quick Stats for the dashboard: sizes of the backlog and recent completion activity. */
export function getCompletionStats(items: readonly Item[], now: Date): CompletionStats {
  const totalBacklog = items.filter((item) => item.status === 'backlog').length

  const completedCount = items.filter((item) => item.status === 'completed').length

  const completedWithDate = items.filter(
    (item): item is Item & { dateCompleted: string } =>
      item.status === 'completed' && item.dateCompleted !== undefined,
  )
  const completedThisMonth = completedWithDate.filter((item) =>
    isSameMonth(item.dateCompleted, now),
  ).length
  const completedThisYear = completedWithDate.filter((item) =>
    isSameYear(item.dateCompleted, now),
  ).length

  const completionPercentage =
    items.length === 0 ? 0 : Math.round((completedCount / items.length) * 100)

  const itemsByCategory = Object.fromEntries(
    CATEGORY_REGISTRY.map((category) => [
      category.id,
      items.filter((item) => item.category === category.id).length,
    ]),
  ) as Record<CategoryId, number>

  return {
    totalBacklog,
    completedThisMonth,
    completedThisYear,
    completionPercentage,
    itemsByCategory,
  }
}
