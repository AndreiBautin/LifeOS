import { daysPractisedIn, solvedIn } from '@/domain/mind/practice'
import { getGoalsStats } from '@/domain/backlog/goals-stats'
import { isBase, isJobs, isOwnArea } from '@/domain/base/base'
import { houseStanding } from '@/domain/base/declutter'
import { latest } from '@/domain/finance/reading'
import {
  ageFromBirthYear,
  netWorthPercentile,
  retirementAgainstBenchmark,
} from '@/domain/finance/standards'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import type { Daily } from '@/domain/dailies/daily'
import { isDoneOn, isExpectedOn, shiftDay } from '@/domain/dailies/daily'
import type {
  BacklogItemRepository,
  Clock,
  ExploredAreaRepository,
  DailyRepository,
  PlaceRepository,
  ProjectRepository,
  RoomRepository,
  SettingsRepository,
  UpgradeRepository,
  ViceRepository,
  AttemptRepository,
  FinanceRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { isOwned, isOpen } from '@/domain/upgrades/upgrade'
import { amountSpentOn } from '@/domain/vitals/charges'
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
  readonly places: PlaceRepository
  readonly dailies: DailyRepository
  readonly explored: ExploredAreaRepository
  readonly settings: SettingsRepository
  readonly rooms: RoomRepository
  readonly vices: ViceRepository
  readonly finance: FinanceRepository
  readonly attempts: AttemptRepository
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

  const allProjects = await deps.projects.all()

  /*
   * Own-area only, because this feeds `projects.throughput` — a rating
   * about the quest log. Counting every project anywhere meant a house
   * job's steps already scored as quest throughput, and adding the job
   * search would have put a screen and an interview in there too. The
   * same leak `recommendation` had, in the rating rather than the
   * suggestion.
   */
  const projects = allProjects.filter(isOwnArea)
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

  /*
   * Stage advances, from the dates the steps were closed on.
   *
   * `completedAt` is what makes this countable: an application storing
   * only its current stage would say where each one is and never when it
   * got there, and a rating that judges a *direction* needs the dates.
   *
   * The other declared rating — `jobs.applications-in-week` — has no
   * producer here on purpose. It is the only weekly rating in the app,
   * and `measure.ts` is monthly throughout because a snapshot is what
   * gives a direction two points in time. An unproduced source reads as
   * **absent** rather than zero, which the spine skips, so declaring it
   * and not feeding it says nothing rather than something false.
   */
  const applications = allProjects.filter(isJobs)
  if (applications.length > 0) {
    measured['jobs.stage-advances-in-month'] = applications
      .flatMap((application) => application.actions)
      .filter(
        (action) => action.status === 'done' && action.completedAt?.slice(0, 7) === toMonth(now),
      ).length
  }

  /*
   * Two numbers rather than one, and the pair is the point: six problems
   * in one Sunday and six spread over six days are very different
   * months, and neither figure alone can say which happened.
   *
   * Absent when nothing has been practised at all, never zero -- a month
   * with no practice is not a month that scored nought, and a fabricated
   * reading makes the next month's trend a lie too.
   */
  const attempts = await deps.attempts.all()
  if (attempts.length > 0) {
    measured['mind.problems-solved-in-month'] = solvedIn(attempts, toMonth(now))
    measured['mind.days-practised-in-month'] = daysPractisedIn(attempts, toMonth(now))
  }

  /*
   * **The credit score is read live; the money figures are read for the
   * month.** That split is the ladder/rating split made concrete.
   *
   * A ladder is anchored to something external — the FICO bands — and
   * its answer must not depend on whether the review was opened, so it
   * takes the most recent score on file whenever that was. The ratings
   * judge a *direction*, which needs one figure per month in a series,
   * so they take this month's and nothing else.
   *
   * Per field rather than per row, because somebody who checks their
   * score quarterly and their net worth monthly has months where one is
   * present and the other is not. Absent, never zero: a month nobody
   * looked is not a month the number was nothing.
   */
  const finance = await deps.finance.all()
  const score = latest(finance, 'creditScore')
  if (score !== undefined) measured['finance.credit-score'] = score

  /*
   * **The money figures are read live, like the credit score, and not
   * for the month.** A ladder must not depend on whether a screen was
   * opened: the two below used to be monthly *ratings*, where a series
   * is the whole point, and as ladders what matters is the most recent
   * statement whenever it was taken.
   *
   * Both are absent without a birth year, and retirement is absent
   * without an income too. `domain/finance/standards.ts` says why an
   * age has to be stated rather than assumed.
   */
  const money = await deps.settings.get()
  const netWorth = latest(finance, 'netWorthMinor')
  const retirement = latest(finance, 'retirementMinor')
  /*
   * The salary is a tracked reading rather than a settings field, so the
   * benchmark follows a raise the month it is recorded. It briefly lived
   * in settings and that was one number in two places.
   */
  const salary = latest(finance, 'salaryMinor')

  if (money.birthYear !== undefined) {
    const age = ageFromBirthYear(money.birthYear, now)

    if (netWorth !== undefined) {
      const percentile = netWorthPercentile(netWorth, age)
      if (percentile !== undefined) measured['finance.net-worth-percentile'] = percentile
    }

    if (retirement !== undefined) {
      const share = retirementAgainstBenchmark(retirement, salary, age)
      if (share !== undefined) measured['finance.retirement-share'] = share
    }
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

  /*
   * Measured twice over the same shape, once per area.
   *
   * A chore is a daily that belongs to Base, so it must not also move the
   * Dailies rating — two areas reading the same records would report the
   * same month twice under different names, and a bad week would look
   * like two bad weeks.
   *
   * Absent rather than zero when a side has nothing expected, which is
   * the rule everywhere in the review: somebody with no chores has not
   * failed to keep them.
   */
  const shareKept = (records: readonly Daily[]): number | undefined => {
    let expected = 0
    let kept = 0

    for (const daily of records) {
      for (let back = 0; back < 31; back += 1) {
        const day = shiftDay(toDay(now), -back)
        if (day.slice(0, 7) !== month) break
        if (!isExpectedOn(daily, day)) continue
        expected += 1
        if (isDoneOn(daily, day)) kept += 1
      }
    }

    return expected > 0 ? Math.round((100 * kept) / expected) : undefined
  }

  const ownShare = shareKept(dailies.filter(isOwnArea))
  if (ownShare !== undefined) measured['dailies.kept-share-in-month'] = ownShare

  /*
   * **Base is measured on the house, not on its chores.** Reported:
   * *"base should be more about declutter and projects status vs
   * recurring tasks."* Right — a chore is a recurring task that happens
   * to be filed to Base, and reading Base's month as "did you keep your
   * chores" made it a second dailies rating under another name. What
   * Base is actually about is the state of the place and the work
   * outstanding on it, and both are already recorded.
   *
   * `base.chore-share-in-month` is gone with the rating it fed. Nothing
   * else read it, and a source nothing declares is dead weight the
   * spine would go on computing every month.
   */

  /*
   * How clear the house is, averaged over the rooms that have a reading.
   *
   * A **level**, not a count of jobs — clutter moves both ways over
   * months, which is the whole reason a room carries a series of
   * readings rather than a checklist. Absent until something has been
   * read, so a house nobody has looked at reports nothing rather than
   * nought: `houseStanding` leaves unread rooms out for exactly that
   * reason, and folding them in as zero would make *adding a room* read
   * as the house getting worse.
   */
  const house = houseStanding(await deps.rooms.all(), `${month}-01`)
  if (house.clear !== undefined) measured['base.clear'] = house.clear

  /*
   * Steps closed on house jobs this month.
   *
   * The Base half of `projects.actions-closed-in-month`, and it can be
   * counted the same way precisely because that one is own-area only —
   * so a house job's steps land here and nowhere else. Rule three holds
   * by the two filters being complements.
   *
   * Absent when there are no house jobs at all: a month with nothing to
   * do on the house did not fail to do it.
   */
  const houseJobs = allProjects.filter(isBase)
  if (houseJobs.length > 0) {
    measured['base.job-steps-in-month'] = houseJobs.flatMap((project) =>
      project.actions.filter(
        (action) => action.status === 'done' && action.completedAt?.slice(0, 7) === toMonth(now),
      ),
    ).length
  }

  /*
   * The share of days this month that stayed inside every pool.
   *
   * Counted across the pools together rather than one rating per vice,
   * because the rating is about the habit of staying inside a budget and
   * not about coffee specifically — and a rating per pool would mean the
   * registry grew a row every time somebody added one, which a registry
   * of *declared* metrics cannot do.
   *
   * A day is over the limit if any pool spent more than its capacity on
   * that day. That is a per-day reading rather than the cooldown window
   * the bar uses, and the difference is deliberate: the bar answers "can
   * I have one now", which is a question about the last twelve hours,
   * and the month answers "how often did I go past what I meant to",
   * which is a question about days.
   */
  const vices = (await deps.vices.all()).filter((vice) => vice.retiredAt === undefined)

  if (vices.length > 0) {
    const daysSoFar = Number(toDay(now).slice(8, 10))
    let within = 0

    for (let back = 0; back < daysSoFar; back += 1) {
      const day = shiftDay(toDay(now), -back)
      if (day.slice(0, 7) !== month) break

      /*
       * `amountSpentOn` rather than counting entries, and it fixes two
       * things at once. Entries were compared by their *UTC* date prefix
       * against a local day key, so an evening drink counted towards
       * tomorrow — and a row was treated as one unit, which meant a
       * 400 mg caffeine limit needed four hundred separate coffees
       * before this rating noticed anything.
       */
      const overAny = vices.some((vice) => amountSpentOn(vice, day) > vice.capacity)

      if (!overAny) within += 1
    }

    measured['vitals.days-within-limits'] = Math.round((100 * within) / Math.max(1, daysSoFar))
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
