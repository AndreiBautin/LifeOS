import { getCompletionStats, type CompletionStats } from '@/domain/backlog/completion-stats'
import { getDailyGoalBoard, type DailyGoalBoard } from '@/domain/backlog/daily-goals'
import { getDashboardSections, type DashboardSections } from '@/domain/backlog/dashboard-sections'
import { getGoalsStats, type GoalsStats } from '@/domain/backlog/goals-stats'
import type { BacklogItemRepository, Clock } from '@/domain/repositories/ports'

/**
 * Everything the backlog's screens read, derived rather than stored.
 *
 * All four of these are pure functions over the item list, so nothing here
 * caches or persists a summary. A stored total is a total that can be
 * wrong, and this app already knows what that costs.
 */

export interface BacklogReadDeps {
  readonly items: BacklogItemRepository
  readonly clock: Clock
}

export interface BacklogOverview {
  readonly sections: DashboardSections
  readonly stats: CompletionStats
}

export async function backlogOverview(deps: BacklogReadDeps): Promise<BacklogOverview> {
  const items = await deps.items.all()

  return {
    sections: getDashboardSections(items),
    stats: getCompletionStats(items, deps.clock.now()),
  }
}

export async function dailyGoalBoard(deps: BacklogReadDeps): Promise<DailyGoalBoard> {
  return getDailyGoalBoard(await deps.items.all(), deps.clock.now())
}

export async function backlogGoalsStats(deps: BacklogReadDeps): Promise<GoalsStats> {
  return getGoalsStats(await deps.items.all(), deps.clock.now())
}
