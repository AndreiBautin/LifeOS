import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'

const CATALOGUE = builtInExercises()

const bySlug = (slug: string) => CATALOGUE.find((exercise) => (exercise.id as string) === slug)

/*
 * The shipped library, as a set of claims rather than a list.
 *
 * Everything here is delivered by editing the catalogue — there is no
 * store of record any more — so a careless edit reaches every device on
 * the next load. These are the properties worth failing a build over.
 */

/*
 * The failure-safety flag is gone, and this is what it used to say.
 *
 * `safeToFail` marked twelve exercises as not to be taken to failure for
 * three different reasons — you would be pinned under the bar, the
 * failing rep puts an elbow somewhere bad, or failure is not a clean
 * event because there is always another rep if you cheat the form. The
 * third covered most of the isolation work and was the strongest of the
 * three: an instruction that resolves differently every week is worse
 * than one rep in reserve every week.
 *
 * Every hypertrophy slot now ends in a set to failure regardless. The
 * argument above is preserved in `hypertrophySets` rather than here,
 * because there is no longer a field to hang it on — and if the rule
 * needs narrowing again, a lateral raise and a good morning are the two
 * to look at first for opposite reasons.
 */

describe('what the catalogue no longer ships', () => {
  /*
   * Withdrawn on purpose, and named here so a future edit that restores
   * one has to argue with a test rather than slip past review.
   *
   * `resolveLibrary` keeps a withdrawn built-in on any device that
   * already had it, archived, so old logs still resolve — but nothing
   * will program it again.
   */
  /*
   * `db-curl` was on this list and is not any more.
   *
   * It was withdrawn because "the EZ bar version is easier to load",
   * which is a preference rather than a fault, and the lifter has since
   * preferred otherwise. Worth recording that the list did its job: the
   * restore had to come through here rather than appearing quietly in
   * the catalogue.
   *
   * The reverse is the case worth being careful about. Something
   * withdrawn for a *reason that still holds* — hard to load, covered by
   * something better — should stay withdrawn, and the fix for wanting it
   * is to change the reason, not to delete the line.
   */
  /*
   * The upright row was on this list, withdrawn because "the lateral raise
   * covers the side delts", and it is back — restored deliberately so the
   * side delts have two movements to alternate between rather than the same
   * one twice a week.
   *
   * That is the second restore to come through here, which is the list
   * working: a withdrawal has to be undone in one visible place rather than
   * an exercise quietly reappearing in the catalogue.
   */
  const withdrawn: readonly (readonly [string, string])[] = [
    ['kb-single-leg-rdl', 'hard to load'],
    ['incline-push-up', 'hard to load without an adjustable bench'],
    ['lunge', 'withdrawn earlier'],
    ['bulgarian-split-squat', 'withdrawn earlier'],
    ['behind-back-shrug', 'withdrawn earlier'],
  ]

  it.each(withdrawn)('no longer ships %s (%s)', (slug) => {
    expect(bySlug(slug)).toBeUndefined()
  })
})
