import { getGoalsStats } from '@/domain/backlog/goals-stats'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import { isDoneOn, isExpectedOn, shiftDay } from '@/domain/dailies/daily'
import { isActive } from '@/domain/social/circle'
import type {
  BacklogItemRepository,
  Clock,
  ExploredAreaRepository,
  FriendRepository,
  DailyRepository,
  PlaceRepository,
  ProjectRepository,
  SettingsRepository,
  UpgradeRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { isOwned, isOpen } from '@/domain/upgrades/upgrade'
import { atlasView } from '@/application/use-cases/atlas/atlas'

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
  readonly places: PlaceRepository
  readonly dailies: DailyRepository
  readonly explored: ExploredAreaRepository
  readonly settings: SettingsRepository
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
   * The share of expected days a habit was actually kept, this month.
   *
   * Expected days rather than calendar days: a weekday habit that is kept
   * every weekday is 100 per cent, not 71. Scoring it against the calendar
   * would make every cadence but every-day look like a failure, which is
   * the same mistake the streak avoids.
   */
  const dailies = await deps.dailies.all()
  const month = toMonth(now)
  let expected = 0
  let kept = 0
  for (const daily of dailies) {
    for (let back = 0; back < 31; back += 1) {
      const day = shiftDay(toDay(now), -back)
      if (day.slice(0, 7) !== month) break
      if (!isExpectedOn(daily, day)) continue
      expected += 1
      if (isDoneOn(daily, day)) kept += 1
    }
  }
  if (expected > 0) {
    measured['dailies.kept-share-in-month'] = Math.round((100 * kept) / expected)
  }

  /*
   * The strength ladders, as **multiples of bodyweight** rather than as
   * loads.
   *
   * The source ids say `e1rm`, but the number placed on the ladder is a
   * ratio, because the thresholds are ratios — every published standard is
   * expressed that way, and it is the whole reason "Advanced" here means
   * what a coach means by it. Feeding pounds to a ladder whose rungs are
   * 0.75 and 1.25 would put everyone at Elite.
   *
   * No bodyweight means no reading at all, for the same reason: the
   * standards are not expressible without it.
   */
  const strength = await deps.settings.get()
  const bodyweight = strength.bodyweight
  if (bodyweight !== undefined && bodyweight > 0) {
    const maxes = strength.estimatedMaxes
    const ratio = (slug: string): number | undefined => {
      const max = maxes[asExerciseId(slug)]
      return max === undefined ? undefined : max / bodyweight
    }

    const squat = ratio(STRENGTH_LIFT_SLUGS.squat)
    const bench = ratio(STRENGTH_LIFT_SLUGS.bench)
    const deadlift = ratio(STRENGTH_LIFT_SLUGS.deadlift)

    if (squat !== undefined) measured['training.squat-e1rm'] = squat
    if (bench !== undefined) measured['training.bench-e1rm'] = bench
    if (deadlift !== undefined) measured['training.deadlift-e1rm'] = deadlift

    // All three or none. A total missing the bench is not a smaller total,
    // it is a wrong one — and it would read as a lower level rather than
    // as a gap, which is the failure this whole file is careful about.
    if (squat !== undefined && bench !== undefined && deadlift !== undefined) {
      measured['training.total'] = squat + bench + deadlift
    }
  }

  /*
   * The exploration ladder's denominator is the one number the app cannot
   * work out for itself — see `exploredRegionKm2`. Without it there is no
   * share to report, and an absent reading is exactly what the spine
   * expects: no region set means the ladder says nothing, rather than
   * scoring somebody against a figure nobody chose.
   */
  const region = strength.exploredRegionKm2
  if (region !== undefined && region > 0) {
    const view = await atlasView({
      places: deps.places,
      explored: deps.explored,
      clock: deps.clock,
      // `atlasView` reads; nothing here creates a place, so no id is ever
      // asked for.
      ids: { next: () => '' },
    })
    // Capped: walking more ground than the region you named means the
    // region was named too small, not that you are 140 per cent explored.
    measured['places.explored-share'] = Math.min(1, view.areaKm2 / region)
  }

  /*
   * The two job-search sources are still left out on purpose. They belong
   * to an area that has not been absorbed yet — phase 6 — and are declared
   * in the registry because the model was decided in one go. They produce
   * no reading until there is something to read.
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
