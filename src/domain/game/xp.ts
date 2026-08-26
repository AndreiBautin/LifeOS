import { levelFromXp, XP_PER_SESSION, XP_PER_SET, xpForLevel } from './character'

/**
 * One pool, fed by acts and never by outcomes.
 *
 * XP answers "did I show up?", which is the only question the other two
 * currencies cannot answer on a Tuesday. Strength moves on a scale of
 * months; a backlog's age moves on a scale of weeks; logging the session
 * happened this morning.
 *
 * What keeps it honest is that it is paid for *doing the thing*, never for
 * the thing having worked. Logging a session earns XP. Getting stronger
 * does not — that already moved a ladder, and paying it twice is how a
 * number stops being a record of effort and becomes a score somebody is
 * tempted to farm.
 */

/**
 * Something you did, that the app can witness, that is worth XP.
 *
 * `points` is a flat number per occurrence on purpose. Scaling XP by how
 * *well* an act went reintroduces the outcome through the back door — a
 * session worth more because the bar was heavier is a strength ladder
 * paying into the XP pool.
 */
export interface ActDefinition {
  readonly id: string
  readonly area: string
  readonly label: string
  readonly points: number
}

/** The acts training already pays for, in the numbers `character.ts` uses. */
export const TRAINING_ACTS: readonly ActDefinition[] = [
  {
    id: 'training.session-finished',
    area: 'training',
    label: 'Finished a session',
    points: XP_PER_SESSION,
  },
  {
    id: 'training.working-set-logged',
    area: 'training',
    label: 'Logged a working set',
    points: XP_PER_SET,
  },
]

export function pointsFor(actId: string, catalogue: readonly ActDefinition[]): number {
  return catalogue.find((act) => act.id === actId)?.points ?? 0
}

/**
 * The pool, from a tally of acts.
 *
 * A tally rather than a running total, because a running total cannot
 * survive two devices: both increment it, last-write-wins picks one, and
 * the other device's month is gone. Counting occurrences of each act means
 * the acts themselves are the synced records and the pool is derived from
 * them — the same reason the program is derived rather than stored.
 */
export function xpFrom(
  tally: Readonly<Record<string, number>>,
  catalogue: readonly ActDefinition[],
): number {
  return catalogue.reduce((sum, act) => sum + act.points * (tally[act.id] ?? 0), 0)
}

export interface XpStanding {
  readonly xp: number
  readonly level: number
  readonly into: number
  readonly needed: number
}

export function standing(xp: number): XpStanding {
  const { level, into, needed } = levelFromXp(xp)
  return { xp, level, into, needed }
}

export { levelFromXp, xpForLevel }
