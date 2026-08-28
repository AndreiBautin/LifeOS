import type { Daily } from '@/domain/dailies/daily'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'

/**
 * Base is the place you live, treated as an area of its own.
 *
 * It holds three kinds of thing and invents none of them. A leaking tap
 * is a project with steps; a weekly hoover is a daily on a cadence; a new
 * dishwasher is an upgrade with a price. Those are the shapes the app
 * already has, and a second implementation of "a thing with steps" would
 * be two places for a bug about steps to live.
 *
 * **What Base actually changes is where they appear.** House work has a
 * different rhythm from the rest of a quest log — it arrives when
 * something breaks, it is mostly the same errand each time (find the
 * right person, get them to come), and it never finishes. Mixed into the
 * quest list it crowds out the things a person chose to do; on its own
 * screen it reads as maintenance, which is what it is.
 *
 * So membership is one optional field on each record rather than a new
 * store. Absent means the record belongs where it always did, which is
 * the right answer for every row written before Base existed.
 */
export const BASE = 'base'

/**
 * Where a record lives when it is not in its natural home.
 *
 * A single-member union today, and written as one rather than as a
 * boolean because the question is *which* area owns this, not whether
 * some flag is set. A second answer would extend this; an `isBase` flag
 * would have to be replaced.
 */
export type RecordHome = typeof BASE

/** Anything that can be assigned to Base rather than its own area. */
export interface Homed {
  readonly belongsTo?: RecordHome
}

export function isBase(record: Homed): boolean {
  return record.belongsTo === BASE
}

/**
 * The complement, and it has to be written down rather than inferred.
 *
 * Every screen that listed one of these types now has to choose a side,
 * and the failure mode is silent in one direction only: forget to exclude
 * Base from the Quests page and a house project shows up in both places,
 * where it reads as a duplicate rather than as a bug. Naming both halves
 * makes the choice explicit at each call site.
 */
export function isOwnArea(record: Homed): boolean {
  return record.belongsTo === undefined
}

/**
 * Which side of the Base split a list wants.
 *
 * Required rather than defaulted, at every list that can return both. A
 * default would be an opinion the call site did not state, and the
 * failure it hides is silent in one direction only: a screen that forgets
 * to exclude Base shows a house job in the quest log *and* on the Base
 * page, where it reads as a duplicate rather than as a bug.
 */
export type HomeFilter = 'own-area' | 'base' | 'both'

export function keepFor<T extends Homed>(records: readonly T[], home: HomeFilter): readonly T[] {
  if (home === 'both') return records
  return records.filter(home === 'base' ? isBase : isOwnArea)
}

export interface BaseContents {
  /** House projects — the thing that broke and who is coming to fix it. */
  readonly projects: readonly Project[]
  /** Chores, on whatever cadence. */
  readonly chores: readonly Daily[]
  /** Upgrades to the place rather than to the person. */
  readonly upgrades: readonly Upgrade[]
}

export function baseContents(
  projects: readonly Project[],
  dailies: readonly Daily[],
  upgrades: readonly Upgrade[],
): BaseContents {
  return {
    projects: projects.filter(isBase),
    chores: dailies.filter(isBase),
    upgrades: upgrades.filter(isBase),
  }
}
