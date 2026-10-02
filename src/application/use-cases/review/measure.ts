import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { asExerciseId } from '@/domain/ids/ids'
import type { Clock, SettingsRepository, WorkoutRepository } from '@/domain/repositories/ports'

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
  readonly workouts: WorkoutRepository
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

  const workouts = await deps.workouts.all()
  const thisMonth = workouts.filter(
    (workout) => workout.status === 'completed' && workout.date.slice(0, 7) === toMonth(now),
  )
  if (workouts.length > 0) {
    measured['training.sessions-in-month'] = thisMonth.length
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

  return measured
}

function toMonth(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}`
}
