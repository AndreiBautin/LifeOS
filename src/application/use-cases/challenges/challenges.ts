import {
  challengesFor,
  passFor,
  type ChallengeMark,
  type ChallengePass,
} from '@/domain/challenges/challenge'
import { seasonLabel, seasonOf, toSeasonId } from '@/domain/game/season'
import type { Clock, ChallengeRepository } from '@/domain/repositories/ports'
import type { IdGenerator } from '@/domain/ids/ids'

/**
 * Reading and marking seasonal challenges.
 *
 * **Nothing here stores a challenge**, only what was said about one. The
 * shipped catalogue lives in the bundle and the season supplies the
 * year, so a completion is a stamped mark against an id and the list is
 * resolved fresh every read — the same derivation-over-storage call the
 * programme, the pool and the avatar all make.
 */

export interface ChallengeDeps {
  readonly challenges: ChallengeRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface SeasonChallenges extends ChallengePass {
  readonly seasonId: string
  readonly seasonLabel: string
}

export async function readChallenges(deps: ChallengeDeps): Promise<SeasonChallenges> {
  const season = seasonOf(deps.clock.now())
  const marks = await deps.challenges.all()
  const pass = passFor(challengesFor(season, marks))

  return { ...pass, seasonId: toSeasonId(season), seasonLabel: seasonLabel(season) }
}

/** The mark as it stands, so an edit never drops a field it did not set. */
async function markFor(id: string, deps: ChallengeDeps): Promise<ChallengeMark> {
  const existing = (await deps.challenges.all()).find((one) => one.id === id)
  return existing ?? { id }
}

/**
 * Ticks a challenge, or unticks it.
 *
 * **Two names rather than one with a flag**, the rule this codebase
 * holds for destructive and non-destructive pairs — a call site must not
 * be able to ask for "record this" and receive "take it back".
 *
 * Unticking rebuilds the mark without `completedAt` rather than setting
 * it to undefined, because an absent key and a key holding undefined are
 * different things under `exactOptionalPropertyTypes` and only the first
 * reads as "never done".
 */
export async function completeChallenge(id: string, deps: ChallengeDeps): Promise<void> {
  const mark = await markFor(id, deps)
  await deps.challenges.save({ ...mark, completedAt: deps.clock.now().toISOString() })
}

export async function uncompleteChallenge(id: string, deps: ChallengeDeps): Promise<void> {
  const { completedAt: _dropped, ...rest } = await markFor(id, deps)
  await deps.challenges.save(rest)
}

/**
 * Writes a challenge of your own, scoped to the season you are in.
 *
 * Scoped rather than dated, because an own challenge has no window: it
 * belongs to this season and that is the whole of its timing. A shipped
 * one carries dates because the catalogue describes a holiday.
 */
export async function addChallenge(title: string, deps: ChallengeDeps): Promise<void> {
  const trimmed = title.trim()
  if (trimmed === '') return

  const season = seasonOf(deps.clock.now())

  await deps.challenges.save({
    id: deps.ids.next(),
    own: { title: trimmed, seasonId: toSeasonId(season) },
  })
}

/**
 * Takes a challenge off the list.
 *
 * **Hidden rather than deleted, and that is not squeamishness.** A
 * shipped challenge lives in the bundle, so deleting its mark would put
 * the challenge straight back on the next release — the stamp is the
 * only way to say "not this one" durably. An own challenge is hidden by
 * the same field so there is one predicate rather than two paths.
 *
 * A completion already recorded is left alone underneath. Removing a
 * challenge says you do not want to see it; it cannot unmake an
 * afternoon you spent, and `tallyActs` goes on counting it.
 */
export async function hideChallenge(id: string, deps: ChallengeDeps): Promise<void> {
  const mark = await markFor(id, deps)
  await deps.challenges.save({ ...mark, hiddenAt: deps.clock.now().toISOString() })
}
