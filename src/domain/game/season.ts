/**
 * Seasons, as the unit a stretch of life is remembered in.
 *
 * "How was my winter" is a question somebody actually asks. "How was
 * 2026-02" is not, which is why the review's month was the wrong period to
 * present even though it is the right period to *record*.
 *
 * Meteorological rather than astronomical: Dec–Feb, Mar–May, Jun–Aug,
 * Sep–Nov. The astronomical seasons start at solstices and equinoxes and
 * so cut months in half, which would put a single day's progress in two
 * seasons at once and make every key in here a range rather than a set of
 * months. Nothing about this app is improved by that.
 *
 * Northern hemisphere, hardcoded. That is a single-user assumption rather
 * than an oversight — there is one person using this and December is
 * winter for them. Making it a setting means a setting, a sync key, a
 * screen and a migration to express something one constant already says.
 */

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const

export type Season = (typeof SEASONS)[number]

export const SEASON_LABELS: Readonly<Record<Season, string>> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
}

/** Month numbers, 1–12, in the order they occur within the season. */
export const SEASON_MONTHS: Readonly<Record<Season, readonly number[]>> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
}

/**
 * A season and the year it belongs to.
 *
 * Winter is the awkward one: it spans a year boundary, so December 2025
 * and January 2026 are the same season. It is named for the year it
 * **ends** in — the December belongs to the following winter — which is
 * the ordinary convention and the one that makes "Winter 2026" mean the
 * winter somebody just lived through rather than the one starting in a
 * fortnight.
 */
export interface SeasonKey {
  readonly season: Season
  readonly year: number
}

export function seasonOf(date: Date): SeasonKey {
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  if (month === 12) return { season: 'winter', year: year + 1 }
  if (month <= 2) return { season: 'winter', year }
  if (month <= 5) return { season: 'spring', year }
  if (month <= 8) return { season: 'summer', year }
  return { season: 'autumn', year }
}

/** `2026-winter`. Sorts within a year but not across seasons — see `compareSeasons`. */
export function toSeasonId(key: SeasonKey): string {
  return `${key.year.toString().padStart(4, '0')}-${key.season}`
}

export function seasonLabel(key: SeasonKey): string {
  return `${SEASON_LABELS[key.season]} ${key.year.toString()}`
}

/** Month keys (`YYYY-MM`) the season covers, in order. */
export function monthsIn(key: SeasonKey): readonly string[] {
  return SEASON_MONTHS[key.season].map((month) => {
    // December belongs to the winter named for the *next* year, so it is
    // the one month whose calendar year is one behind its season's.
    const year = key.season === 'winter' && month === 12 ? key.year - 1 : key.year
    return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`
  })
}

/** Whether a `YYYY-MM-DD` or ISO timestamp falls inside the season. */
export function isInSeason(key: SeasonKey, isoDate: string): boolean {
  return monthsIn(key).includes(isoDate.slice(0, 7))
}

/**
 * The season before each one, and whether that crosses a year.
 *
 * A total map rather than index arithmetic on `SEASONS`: indexing needs
 * either a bounds assertion or an unreachable fallback, and both are ways
 * of telling the compiler something it could have checked. Winter is the
 * only one that steps back into the previous year, which this states
 * rather than implies.
 */
const PRECEDED_BY: Readonly<
  Record<Season, { readonly season: Season; readonly yearsBack: 0 | 1 }>
> = {
  winter: { season: 'autumn', yearsBack: 1 },
  spring: { season: 'winter', yearsBack: 0 },
  summer: { season: 'spring', yearsBack: 0 },
  autumn: { season: 'summer', yearsBack: 0 },
}

export function previousSeason(key: SeasonKey): SeasonKey {
  const before = PRECEDED_BY[key.season]
  return { season: before.season, year: key.year - before.yearsBack }
}

/** Chronological order, which the id alone does not give. */
export function compareSeasons(a: SeasonKey, b: SeasonKey): number {
  if (a.year !== b.year) return a.year - b.year
  return SEASONS.indexOf(a.season) - SEASONS.indexOf(b.season)
}

/**
 * How far through the season a moment is, 0–1.
 *
 * Counted in days rather than months so the bar moves daily. A season
 * that has not started reads 0 and one already over reads 1, so a key
 * from the past renders as a finished season rather than as an
 * out-of-range number.
 */
export function seasonProgress(key: SeasonKey, now: Date): number {
  const months = monthsIn(key)
  const first = months[0]
  const last = months[months.length - 1]
  if (first === undefined || last === undefined) return 0

  const start = new Date(`${first}-01T00:00:00.000Z`).getTime()
  // The first instant of the month after the last one in the season.
  const [lastYear, lastMonth] = last.split('-').map(Number)
  if (lastYear === undefined || lastMonth === undefined) return 0
  const end = Date.UTC(lastMonth === 12 ? lastYear + 1 : lastYear, lastMonth % 12, 1)

  const elapsed = now.getTime() - start
  const total = end - start
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 1
  return elapsed / total
}

/** Whole days left, 0 once the season is over. */
export function daysLeftIn(key: SeasonKey, now: Date): number {
  const months = monthsIn(key)
  const last = months[months.length - 1]
  if (last === undefined) return 0

  const [lastYear, lastMonth] = last.split('-').map(Number)
  if (lastYear === undefined || lastMonth === undefined) return 0
  const end = Date.UTC(lastMonth === 12 ? lastYear + 1 : lastYear, lastMonth % 12, 1)

  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000))
}
