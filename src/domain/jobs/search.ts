import { ATS_PROVIDERS, type AtsProvider } from './boards'
import type { SearchProfile } from './score'

/**
 * The standing job search: which boards to read, and what counts as a
 * lead on them.
 *
 * **This existed only as component state, which made it a bug rather
 * than a preference.** The board slugs and every filter lived in
 * `useState` on the leads panel, so they were wiped by any navigation —
 * type in four boards, tap through to an application, come back to an
 * empty form. A search you have to retype is a search nobody runs twice.
 *
 * It is stored in settings and **travels between devices**, because a
 * board slug is a fact about the search rather than about the phone: the
 * work of assembling the list is the same work on both, and a list that
 * only existed on whichever device you happened to have typed it into is
 * the same defect one layer up.
 */

/** A board to read: what kind it is, and its slug. */
export interface BoardSource {
  readonly provider: AtsProvider
  readonly token: string
}

export interface JobSearch {
  readonly sources: readonly BoardSource[]
  readonly profile: SearchProfile
  /**
   * The score a posting must reach to be shown at all, 0–100.
   *
   * It was a literal `0` at the one call site, so the scorer ranked
   * everything and hid nothing — which on a board of four hundred
   * postings is a ranked list of four hundred postings. The excludes
   * were hardcoded to empty lists beside it, for the same reason: the
   * screen only had boxes for three of the six filters, so the other
   * three could not be set from anywhere.
   */
  readonly minimumScore: number
}

/**
 * Low enough to show near-misses, high enough to drop the rest of the
 * board.
 *
 * A posting that matches no title term and no keyword still scores for
 * being fresh and in the right place, so the floor cannot be zero
 * without the list being the whole board.
 */
export const DEFAULT_MINIMUM_SCORE = 40

/**
 * A search that reads nothing and rejects nothing.
 *
 * Deliberately not a sample list of boards. The suggestions on the
 * screen are an offer; seeding real employers into everybody's settings
 * would be the app deciding where somebody wants to work, and — since
 * this is a public repository — the seed would be a published opinion
 * about one person's job hunt.
 */
export const EMPTY_JOB_SEARCH: JobSearch = {
  sources: [],
  minimumScore: DEFAULT_MINIMUM_SCORE,
  profile: {
    titleIncludes: [],
    titleExcludes: [],
    keywordIncludes: [],
    keywordExcludes: [],
    locationIncludes: [],
    remoteOnly: false,
  },
}

/**
 * `greenhouse:stripe`, which is what a board actually is — a kind and a
 * slug.
 *
 * Kept as the paste format even though the screen offers a picker and a
 * field, because it is how somebody with a list already written moves it
 * in, and it is what the old textarea accepted. Unknown kinds and blank
 * slugs are dropped rather than refused: this parses a paste, and one
 * bad line should not reject the nine good ones above it.
 */
export function parseSources(raw: string): readonly BoardSource[] {
  return raw
    .split(/[\n\r,]+/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '')
    .flatMap((line) => {
      const [kind, token] = line.split(':')
      const provider = ATS_PROVIDERS.find((one) => one === kind)

      return provider === undefined || token === undefined || token.trim() === ''
        ? []
        : [{ provider, token: token.trim() }]
    })
}

/** The same, back out — so what was pasted in can be read and copied. */
export function formatSources(sources: readonly BoardSource[]): string {
  return sources.map((source) => `${source.provider}:${source.token}`).join('\n')
}

/**
 * Whether two sources name the same board.
 *
 * A board can be followed once. Reading it twice would double every
 * posting on it, and the leads list would show each one beside itself.
 */
export function sameSource(a: BoardSource, b: BoardSource): boolean {
  return a.provider === b.provider && a.token.toLowerCase() === b.token.toLowerCase()
}

/** Adds a board unless it is already followed. */
export function withSource(
  sources: readonly BoardSource[],
  source: BoardSource,
): readonly BoardSource[] {
  const token = source.token.trim().toLowerCase()
  if (token === '') return sources

  const next = { provider: source.provider, token }

  return sources.some((one) => sameSource(one, next)) ? sources : [...sources, next]
}

export function withoutSource(
  sources: readonly BoardSource[],
  source: BoardSource,
): readonly BoardSource[] {
  return sources.filter((one) => !sameSource(one, source))
}

/**
 * Whether the search can be run at all.
 *
 * A profile with no filters is a valid search — it scores everything on
 * the boards and ranks it — so the only thing genuinely required is
 * somewhere to read from. Saying so is what lets the screen explain an
 * empty result rather than reporting nothing and looking broken.
 */
export function canSweep(search: JobSearch): boolean {
  return search.sources.length > 0
}

/**
 * Reads a stored search back, treating it as the untrusted blob it is.
 *
 * Built field by field rather than cast, the same as the settings parse
 * around it: this arrives from `localStorage` or from another device,
 * and asserting it is already a `JobSearch` is how a validator ends up
 * checking conditions the compiler has decided cannot fail.
 *
 * Every branch falls back to the empty search rather than throwing. A
 * settings blob that cannot be read must not stop the app starting, and
 * a job search that comes back empty is recoverable by retyping it —
 * which is not true of anything else in here.
 */
export function parseJobSearch(value: unknown): JobSearch {
  if (typeof value !== 'object' || value === null) return EMPTY_JOB_SEARCH

  const bag = value as Record<string, unknown>
  const profileBag = (
    typeof bag.profile === 'object' && bag.profile !== null ? bag.profile : {}
  ) as Record<string, unknown>

  const terms = (raw: unknown): readonly string[] =>
    Array.isArray(raw) ? raw.filter((one): one is string => typeof one === 'string') : []

  const sources = Array.isArray(bag.sources)
    ? bag.sources.flatMap((one): readonly BoardSource[] => {
        if (typeof one !== 'object' || one === null) return []
        const source = one as Record<string, unknown>
        const provider = ATS_PROVIDERS.find((kind) => kind === source.provider)

        return provider === undefined || typeof source.token !== 'string' || source.token === ''
          ? []
          : [{ provider, token: source.token }]
      })
    : []

  const floor = bag.minimumScore
  const maxAgeDays = profileBag.maxAgeDays
  const minSalaryMinor = profileBag.minSalaryMinor

  return {
    sources,
    // Clamped rather than defaulted on any non-number: a stored 150 would
    // silently hide every posting, which reads as the boards being empty.
    minimumScore:
      typeof floor === 'number' && Number.isFinite(floor)
        ? Math.min(100, Math.max(0, floor))
        : DEFAULT_MINIMUM_SCORE,
    profile: {
      titleIncludes: terms(profileBag.titleIncludes),
      titleExcludes: terms(profileBag.titleExcludes),
      keywordIncludes: terms(profileBag.keywordIncludes),
      keywordExcludes: terms(profileBag.keywordExcludes),
      locationIncludes: terms(profileBag.locationIncludes),
      remoteOnly: profileBag.remoteOnly === true,
      // Spread conditionally: under `exactOptionalPropertyTypes` an
      // absent field and one set to undefined are different, and only
      // the first means "no ceiling".
      ...(typeof maxAgeDays === 'number' && Number.isFinite(maxAgeDays) ? { maxAgeDays } : {}),
      ...(typeof minSalaryMinor === 'number' && Number.isFinite(minSalaryMinor)
        ? { minSalaryMinor }
        : {}),
    },
  }
}
