import { getGoalsStats } from '@/domain/backlog/goals-stats'
import { isActive } from '@/domain/social/circle'
import type {
  BacklogItemRepository,
  Clock,
  FriendRepository,
  ProjectRepository,
  UpgradeRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { isOwned, isOpen } from '@/domain/upgrades/upgrade'

/**
 * Reading this month's numbers out of the hub's own data.
 *
 * Every measured metric in `domain/game/registry.ts` names a `source`, and
 * this is the one place those names turn into numbers. It is the only file
 * in the hub that knows about every area at once, which is deliberate:
 * putting the measurement beside each domain would mean five files that
 * each have to remember to agree with the registry, and this way the
 * disagreement is a missing key rather than a silent zero.
 *
 * Nothing here scores. It counts, and hands the counts to the spine.
 */

export interface MeasureDeps {
  readonly items: BacklogItemRepository
  readonly projects: ProjectRepository
  readonly upgrades: UpgradeRepository
  readonly workouts: WorkoutRepository
  readonly friends: FriendRepository
  readonly clock: Clock
}

/**
 * A source with nothing to measure yet is **absent**, not zero.
 *
 * The distinction runs through the whole spine: a month with no backlog is
 * not a month whose backlog aged zero days, and `seriesFor` skips absent
 * readings precisely so an evaluator is never handed a fabricated number.
 * Returning zero here would defeat that at the source.
 */
export async function measureAll(deps: MeasureDeps): Promise<Readonly<Record<string, number>>> {
  const now = deps.clock.now()
  const measured: Record<string, number> = {}

  const items = await deps.items.all()
  if (items.length > 0) {
    // The backlog's own statistic, not a second implementation of it.
    measured['backlog.median-age-days'] = getGoalsStats(items, now).averageBacklogAgeDays
  }

  const projects = await deps.projects.all()
  const closedThisMonth = projects.flatMap((project) =>
    project.actions.filter(
      (action) => action.status === 'done' && action.completedAt?.slice(0, 7) === toMonth(now),
    ),
  )
  if (projects.length > 0) {
    measured['projects.actions-closed-in-month'] = closedThisMonth.length
  }

  /*
   * Purchase progress is the share of what was planned that is now owned.
   * Cancelled entries are out of both halves — something you decided
   * against is not progress and is not a debt either.
   */
  const upgrades = await deps.upgrades.all()
  const counted = upgrades.filter((upgrade) => isOwned(upgrade) || isOpen(upgrade))
  if (counted.length > 0) {
    measured['upgrades.owned-share'] = Math.round(
      (100 * counted.filter(isOwned).length) / counted.length,
    )
  }

  const workouts = await deps.workouts.all()
  const thisMonth = workouts.filter(
    (workout) => workout.status === 'completed' && workout.date.slice(0, 7) === toMonth(now),
  )
  if (workouts.length > 0) {
    measured['training.sessions-in-month'] = thisMonth.length
  }

  const friends = await deps.friends.all()
  if (friends.length > 0) {
    const asOf = toDay(now)
    measured['social.contacts-in-month'] = friends.filter((friend) =>
      isActive(friend, 12, asOf),
    ).length
  }

  /*
   * Left out on purpose, and worth saying which. `places.explored-share`
   * and the two job-search sources belong to areas that have not been
   * absorbed yet — phases 5 and 6. They are declared in the registry
   * because the model was decided in one go; they produce no reading here
   * until there is something to read, and an absent reading is exactly
   * what the spine expects.
   */
  return measured
}

function toMonth(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`
}

function toDay(date: Date): string {
  return `${toMonth(date)}-${date.getDate().toString().padStart(2, '0')}`
}
