import type { Ladder } from './ladder'
import type { Rating } from './rating'
import { pointsFor, type ActDefinition } from './xp'

/**
 * One event, one credit.
 *
 * The third rule — nothing is counted twice — is the one that cannot be
 * enforced by naming things carefully, because the double count is always
 * locally reasonable. Finishing a session earns XP *and* it is evidence
 * about training consistency *and* it may have moved a lift. Paying all
 * three feels generous and makes every number a function of every other
 * one, at which point no single figure can be trusted on its own.
 *
 * So the rule is a return type: `creditFor` hands back **one** credit or
 * none. There is no shape in which it returns two. Anything that wants a
 * session to move a rating as well emits a second event describing the
 * measurement, and that event is a fact about the world rather than a
 * second payment for the same act.
 */

export type ProgressEvent =
  | { readonly kind: 'act'; readonly act: string; readonly at: string }
  | {
      readonly kind: 'measurement'
      readonly source: string
      readonly value: number
      readonly at: string
    }

export type Credit =
  | { readonly to: 'xp'; readonly points: number }
  | { readonly to: 'ladder'; readonly id: string; readonly value: number }
  | { readonly to: 'rating'; readonly id: string; readonly value: number }

export interface CreditSources {
  readonly acts: readonly ActDefinition[]
  readonly ladders: readonly Ladder[]
  readonly ratings: readonly Rating[]
}

/**
 * Where an event's credit goes, if anywhere.
 *
 * Returns `undefined` rather than throwing for an event naming something
 * the registry does not know. An unknown act is a record written by a
 * newer build, arriving over sync from the other device; refusing to read
 * the whole batch because one row is from next month is a worse failure
 * than ignoring the row.
 */
export function creditFor(event: ProgressEvent, sources: CreditSources): Credit | undefined {
  if (event.kind === 'act') {
    const known = sources.acts.some((act) => act.id === event.act)
    if (!known) return undefined

    return { to: 'xp', points: pointsFor(event.act, sources.acts) }
  }

  const ladder = sources.ladders.find((candidate) => candidate.source === event.source)
  if (ladder !== undefined) return { to: 'ladder', id: ladder.id, value: event.value }

  const rating = sources.ratings.find((candidate) => candidate.source === event.source)
  if (rating !== undefined) return { to: 'rating', id: rating.id, value: event.value }

  return undefined
}
