import { PARTS_OF_DAY, type Daily } from './daily'

/**
 * Grouping habits by what kind of thing they are.
 *
 * The report this answers was "pretty much all of my dailies fall under
 * a certain category". The homes were already right — the house, the
 * body, training, the job hunt — and the list *inside* one of them had
 * got long enough that a supplement, a toothbrush and the dog's dinner
 * read as one undifferentiated column.
 *
 * **A group is a label and a home is a decision**, which is the whole
 * reason this is a string rather than a fifth `RecordHome`. A home says
 * which screen owns the record and which area pays its XP; adding one
 * costs a registry area, an act, a branch in `tallyActs` and a screen.
 * Nothing about wanting to see supplements together asks for any of
 * that.
 */

/**
 * Names that are usually wanted, offered rather than imposed.
 *
 * Suggestions on the form, exactly like the Upkeep habit suggestions and
 * the pool presets: taking one does not stop you typing your own, and
 * the list never becomes the set of legal answers. These are the ones
 * that came up — supplements and pet care were the two named directly.
 */
export const GROUP_SUGGESTIONS = [
  'Supplements',
  'Pet care',
  'Teeth',
  'Skin',
  'Tidying',
  'Admin',
] as const

/**
 * A stored group name, or nothing.
 *
 * Absent rather than empty, because a stored `''` is a state every
 * future reader has to have explained — the same call the pool presets
 * make about an empty list.
 */
export function normaliseGroup(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim() ?? ''

  return trimmed === '' ? undefined : trimmed
}

/** Two names are one group when they differ only by case or padding. */
export function sameGroup(a: string | undefined, b: string | undefined): boolean {
  return (normaliseGroup(a)?.toLowerCase() ?? '') === (normaliseGroup(b)?.toLowerCase() ?? '')
}

export interface DailyGroup {
  /** Absent for the habits that belong to no group. */
  readonly name?: string
  readonly dailies: readonly Daily[]
}

/**
 * How early in the day a habit sits, for ordering. No part sorts last.
 *
 * The same rule a single habit already follows: a habit with no part
 * belongs to no point in the day rather than to the start of it.
 */
function partRank(daily: Daily): number {
  const index = PARTS_OF_DAY.indexOf(daily.partOfDay ?? ('' as never))

  return index === -1 ? PARTS_OF_DAY.length : index
}

/**
 * Habits in groups, and the groups in the order the day happens.
 *
 * **Ordered by their earliest habit, not alphabetically**, and that is
 * the load-bearing choice. Sorting the group names would put Teeth after
 * Supplements on a screen whose whole job is to read as a routine — and
 * the chronological order is already the rule for the rows themselves,
 * so an alphabetical pass over the groups would have the two orderings
 * disagree inside one list.
 *
 * The ungrouped habits come **last**, as their own unnamed group, for
 * the reason a habit with no part of day sorts last: they belong to no
 * category rather than to the first one. A caller renders that group
 * without a heading, because a heading over the leftovers is a category
 * called "everything else" that nobody chose.
 *
 * The input order is preserved within a group, so whatever sort the
 * caller applied — chronological, on every screen that shows these —
 * survives.
 */
export function byGroup(dailies: readonly Daily[]): readonly DailyGroup[] {
  const groups: { name?: string; dailies: Daily[]; rank: number }[] = []

  for (const daily of dailies) {
    const name = normaliseGroup(daily.group)
    const existing = groups.find((one) => sameGroup(one.name, name))

    if (existing === undefined) {
      groups.push({
        ...(name === undefined ? {} : { name }),
        dailies: [daily],
        rank: partRank(daily),
      })
    } else {
      existing.dailies.push(daily)
      // The group sits where its earliest habit does.
      existing.rank = Math.min(existing.rank, partRank(daily))
    }
  }

  return groups
    .sort((a, b) => {
      // Ungrouped last, whatever time of day it happens to run at.
      if (a.name === undefined) return 1
      if (b.name === undefined) return -1

      return a.rank - b.rank || a.name.localeCompare(b.name)
    })
    .map(({ name, dailies: members }) => ({
      ...(name === undefined ? {} : { name }),
      dailies: members,
    }))
}

/**
 * The group names already in use, for offering them back.
 *
 * A name typed once should be one tap the second time — the list a
 * person actually uses is better than the suggestions, and it is the
 * same argument the pool presets make about ending up with what you
 * really drink.
 */
export function groupNamesIn(dailies: readonly Daily[]): readonly string[] {
  const seen: string[] = []

  for (const daily of dailies) {
    const name = normaliseGroup(daily.group)
    if (name !== undefined && !seen.some((one) => sameGroup(one, name))) seen.push(name)
  }

  return seen.sort((a, b) => a.localeCompare(b))
}
