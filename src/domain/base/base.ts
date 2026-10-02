/**
 * Base is the place you live, treated as an area of its own.
 *
 * **It holds upgrades and the clutter readings, and nothing with steps.**
 * House jobs — the leaking tap, the roof, who is coming to fix it — were
 * projects filed here, and they left the app with the quests: asked for
 * as _"drop quests, keep the arc as a checklist"_, then _"drop them too"_
 * of the house jobs, because house projects are worked through in Notion
 * now. What is left is what the app measures about the house — how clear
 * each room is — and what you mean to buy for it.
 *
 * Membership is one optional field on a record rather than a new store.
 * Absent means the record belongs where it always did, which is the
 * right answer for every row written before Base existed.
 */
export const BASE = 'base'

/**
 * Where a record can be filed instead of its own area.
 *
 * One member now. Training, Jobs and Mind were homes for habits and
 * projects, and both of those record types are gone; a stored record
 * still carrying one of those values is simply not matched by any
 * screen, which is the behaviour every retired home has had.
 */
export const RECORD_HOMES = [BASE] as const

export type RecordHome = (typeof RECORD_HOMES)[number]

/** Anything that can be filed to an area other than its own. */
export interface Homed {
  readonly belongsTo?: RecordHome
}

export function isBase(record: Homed): boolean {
  return record.belongsTo === BASE
}

/**
 * The complement, and it has to be written down rather than inferred.
 *
 * A screen listing one of these types has to choose a side, and the
 * failure is silent in one direction only: forget to exclude Base and an
 * upgrade shows on both screens, where it reads as a duplicate rather
 * than as a bug.
 */
export function isOwnArea(record: Homed): boolean {
  return record.belongsTo === undefined
}

/**
 * Which side of the Base split a list wants. Required rather than
 * defaulted at every list that can return both, so the call site states
 * it.
 */
export type HomeFilter = 'own-area' | RecordHome | 'both'

export function keepFor<T extends Homed>(records: readonly T[], home: HomeFilter): readonly T[] {
  if (home === 'both') return records
  if (home === 'own-area') return records.filter(isOwnArea)
  return records.filter((record) => record.belongsTo === home)
}
