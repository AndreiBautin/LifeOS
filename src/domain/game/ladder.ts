import { LEVELS, placeOnLadder, type Level } from './character'

/**
 * A bounded scale, anchored to something the app did not invent.
 *
 * This is `character.ts`'s strength standards generalised to every area
 * the hub will eventually cover. The generalisation is only safe because
 * of what it refuses: a ladder must name the published standard it is
 * anchored to, and a scale the app can move is a scale that means nothing.
 *
 * The consequence, stated plainly so nobody has to rediscover it: most
 * things are not ladders. Backlog health has no top. Neither does project
 * throughput, or how often you see your friends. Those are ratings — see
 * `rating.ts` — and the mistake this type exists to prevent is inventing a
 * ceiling so that a progress bar has somewhere to fill to.
 */
export interface Ladder {
  readonly id: string
  readonly name: string
  /** What is being counted here — see the disjointness rule in `credit.ts`. */
  readonly source: string
  readonly unit: string
  /**
   * The external standard, named.
   *
   * Required, and checked by `registry.test.ts`. A ladder whose anchor
   * reads "felt about right" is a rating that has been given levels, which
   * is the second of the three rules.
   */
  readonly anchor: string
  /** Ascending, one per entry in `LEVELS`. */
  readonly thresholds: readonly number[]
}

export interface LadderReading {
  readonly level: Level
  /** 0–1 toward the next level. 1 when already at the top. */
  readonly progress: number
  /** Absent at the top of the ladder — there is nothing after Elite. */
  readonly next?: { readonly level: Level; readonly at: number }
}

/**
 * Where a measurement sits on a ladder.
 *
 * Takes a *measurement* and nothing else. That signature is the first
 * rule — no ladder is fed by XP — expressed as a type rather than as a
 * paragraph: there is no parameter here through which showing up could
 * raise a level, so no call site can pass one.
 */
export function readLadder(ladder: Ladder, value: number): LadderReading {
  const placed = placeOnLadder(value, ladder.thresholds)

  if (placed.nextThreshold === undefined) {
    return { level: placed.level, progress: placed.progress }
  }

  return {
    level: placed.level,
    progress: placed.progress,
    next: { level: nextLevelAfter(placed.level), at: placed.nextThreshold },
  }
}

function nextLevelAfter(level: Level): Level {
  const index = LEVELS.indexOf(level)
  return LEVELS[Math.min(LEVELS.length - 1, index + 1)] ?? 'Elite'
}
