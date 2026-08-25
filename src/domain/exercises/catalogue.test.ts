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

describe('taking a set to failure', () => {
  /*
   * Three reasons to refuse, and only one of them is about danger.
   *
   * The interesting one is that failure is not always a *definite event*.
   * On a lateral raise, a shrug, a calf raise or a hanging leg raise
   * there is always another rep available if the form gives a little, so
   * "to failure" resolves to "until your technique goes" — an
   * instruction that means something different every week. Dips and
   * pull-ups are the contrast: the rep completes or it does not, and the
   * set ends itself.
   */
  const notToFailure = [
    'db-lateral-raise',
    'rear-delt-raise',
    'barbell-shrug',
    'hanging-leg-raise',
    'ab-wheel',
    'barbell-calf-raise',
    // The triceps isolations are the genuinely unsafe pair — the failing
    // rep is the one that puts an elbow somewhere it should not go.
    'skullcrusher',
    'french-press',
  ]

  it.each(notToFailure)('does not send %s to failure', (slug) => {
    expect(bySlug(slug), slug).toBeDefined()
    expect(bySlug(slug)?.safeToFail).toBe(false)
  })

  /*
   * The counter-examples matter as much: a rule that said "no isolation
   * ever fails" would be a different and worse rule, and these are the
   * movements where failing is both safe and unambiguous.
   */
  it.each(['dips', 'pull-up', 'chin-up'])('still sends %s to failure', (slug) => {
    expect(bySlug(slug)?.safeToFail).toBe(true)
  })
})

describe('what the catalogue no longer ships', () => {
  /*
   * Withdrawn on purpose, and named here so a future edit that restores
   * one has to argue with a test rather than slip past review.
   *
   * `resolveLibrary` keeps a withdrawn built-in on any device that
   * already had it, archived, so old logs still resolve — but nothing
   * will program it again.
   */
  const withdrawn: readonly (readonly [string, string])[] = [
    ['db-curl', 'the EZ bar version is easier to load'],
    ['upright-row', 'the lateral raise covers the side delts'],
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
