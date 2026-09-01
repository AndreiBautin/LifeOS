import { BASE, TRAINING, type RecordHome } from '@/domain/base/base'

import { PARTS_OF_DAY, type Daily, type PartOfDay } from './daily'

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
 * Suggestions on the form, exactly like the hygiene habit suggestions
 * and the pool presets: taking one does not stop you typing your own,
 * and the list never becomes the set of legal answers. These are the
 * ones that came up — supplements and pet care were named directly.
 *
 * *Teeth* left the list when *Upkeep* became *Hygiene*, because the two
 * were then offering the same habits under two names — which is exactly
 * the split this pass is about. A group somebody already has called
 * Teeth is untouched and still offered, since `groupNamesIn` puts the
 * names in use ahead of these.
 *
 * **House and Training are not here on purpose.** They name homes, and
 * a chip that files a habit by *label* under a name the app also uses
 * as a *decision* is how somebody ends up with a house chore that Base
 * has never heard of. Those screens have an Add of their own.
 */
/**
 * The one group name the app itself writes.
 *
 * Upkeep was a **home** — `belongsTo: 'vitals'` — until it became a
 * label, so this is the name a stored record from before that change
 * reads back under, and the name the body-chore suggestions carry. A
 * constant rather than a string at three call sites, because a typo in
 * one of them would silently make a second group with the same look.
 *
 * It is the only reserved name. Every other group is the person's, which
 * is why `GROUP_SUGGESTIONS` is a list of offers and not a union.
 *
 * **It is called Hygiene now, and the old name was a leftover.**
 * Reported: *"upkeep doesn't seem like the correct term, cause upkeep
 * could relate to upkeeping anything — that one is more hygiene stuff
 * since it's brushing, showers, etc."* Correct: the word was carried
 * over from when this was a home covering the body in general, and it
 * has meant brushing, flossing and washing ever since.
 */
export const HYGIENE_GROUP = 'Hygiene'

/**
 * What that group was called before somebody read the word.
 *
 * Renaming a label costs nothing the way renaming a home would — a
 * record means what it meant. What it *does* cost is a split: rows
 * already stored under the old name would sit beside the new one as a
 * second category, which is the very bug this pass exists to fix
 * elsewhere. `fromStoredDaily` reads the old name as the new one — the
 * derivation-rather-than-migration rule `shelfOf` follows — so a row
 * converges the next time anything saves it, which a tick does.
 *
 * **The price, stated rather than hidden:** nobody can now have a group
 * genuinely called Upkeep — for house maintenance, say — because the
 * read path renames it. That is the app having an opinion about a label,
 * which is normally the line held here. It is taken once, deliberately,
 * because every Upkeep group in existence came from this app's own
 * suggestion list or from the legacy home; once real data has converged,
 * this mapping can go.
 */
export const LEGACY_HYGIENE_GROUP = 'Upkeep'

export const GROUP_SUGGESTIONS = [
  HYGIENE_GROUP,
  'Supplements',
  'Pet care',
  'Skin',
  'Tidying',
  'Admin',
] as const

/**
 * What a home is called where it appears beside the groups.
 *
 * **This is the fix for two House headings on one screen.** A house
 * chore is filed by `belongsTo` and a habit somebody labelled "House" is
 * filed by `group`, and Today drew those in two separate passes — so
 * typing the category the screen was already showing produced a second
 * section with the same name and no way to tell why. They are one axis
 * now: a row's *category* is its home's label where it has a home and
 * its group otherwise, so both land in one place by construction.
 *
 * **A label, not a re-filing.** Nothing about this moves a record or
 * changes which area pays its XP — an own-area habit labelled "House"
 * still pays `dailies.completed` and is still managed on Today. What
 * changed is only where it is drawn, which is what was asked for.
 *
 * Only the homes a daily can actually be filed to are named; `JOBS` and
 * `MIND` never hold one.
 */
export const HOME_GROUP_LABELS: Partial<Record<RecordHome, string>> = {
  [BASE]: 'House',
  [TRAINING]: 'Training',
}

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

/** How a caller names the category a habit is filed under. */
export type CategoryOf = (daily: Daily) => string | undefined

/**
 * A habit's group, and nothing about where it is filed.
 *
 * The rule for a screen showing **one** home. Base lists chores, Train
 * lists training habits: reading the home as the category there would
 * put every row under a single heading repeating the name of the screen.
 */
export const groupOnly: CategoryOf = (daily) => normaliseGroup(daily.group)

/**
 * A habit's home if it has one, and its group otherwise.
 *
 * The rule for a screen showing **every** home, which is Today. See
 * `HOME_GROUP_LABELS` for why the two are one axis rather than two.
 */
export const homeOrGroup: CategoryOf = (daily) =>
  (daily.belongsTo === undefined ? undefined : HOME_GROUP_LABELS[daily.belongsTo]) ??
  normaliseGroup(daily.group)

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
 *
 * **What names a category is the caller's decision**, because it differs
 * by screen and getting it wrong is silent in both directions: reading
 * the home on Base puts every chore under one heading called House, and
 * ignoring it on Today draws two sections both called House. There is no
 * default for the same reason `listProjects` takes a required
 * `HomeFilter` — a default here would be an opinion the call site did
 * not state.
 */
export function byGroup(dailies: readonly Daily[], categoryOf: CategoryOf): readonly DailyGroup[] {
  const groups: { name?: string; dailies: Daily[]; rank: number }[] = []

  for (const daily of dailies) {
    const name = categoryOf(daily)
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

export interface DailyBand {
  /** Absent for the habits that name no part of the day. */
  readonly part?: PartOfDay
  readonly groups: readonly DailyGroup[]
}

/**
 * The day in bands, and the categories inside each one.
 *
 * *"Group the dailies by morning, afternoon and evening, and then have
 * the subcategories there — so we have our morning tasks and then
 * they're broken up into house, hygiene, admin."*
 *
 * **Which axis is outer is the whole of this decision.** A day is read
 * as a sequence and a category is read as a kind of thing, so the
 * sequence has to be outermost or the screen answers "what sort of task
 * is this" before it answers "is this now" — and *now* is the question a
 * screen called Today exists for. It is also why nothing is sorted by
 * category first anywhere in here.
 *
 * **A band per part that has habits, never a band for every part.** An
 * empty Afternoon heading is a claim that the afternoon asks something
 * of you, and the whole point of the folding above is not to draw work
 * that is not there.
 *
 * The unbanded habits come **last**, for the reason the ungrouped ones
 * do: a habit naming no part belongs to no point in the day rather than
 * to the start of it. A caller gives that band its own words — "Any
 * time" rather than a fourth clock position it does not have.
 */
export function byPartOfDay(
  dailies: readonly Daily[],
  categoryOf: CategoryOf,
): readonly DailyBand[] {
  const bands: DailyBand[] = []

  for (const part of PARTS_OF_DAY) {
    const members = dailies.filter((daily) => daily.partOfDay === part)
    if (members.length > 0) bands.push({ part, groups: byGroup(members, categoryOf) })
  }

  const unbanded = dailies.filter((daily) => daily.partOfDay === undefined)
  if (unbanded.length > 0) bands.push({ groups: byGroup(unbanded, categoryOf) })

  return bands
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
