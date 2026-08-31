/**
 * Deterministic posting scoring, ported from Career Command Center.
 *
 * A posting must survive every hard filter, then earns 0–100 from title
 * hits, keyword coverage, location fit, published pay and freshness.
 * **No model is involved and every point is explainable**, which is the
 * property worth keeping: a lead that scores 74 can say which of those
 * points it earned and which it did not.
 *
 * Two things are deliberately different from the original, and both are
 * rules this codebase already holds:
 *
 *   - **The reasons are data, not a string.** The C# built a
 *     `StringBuilder` of lines like "+50 title matches …". Structured
 *     reasons let the screen render them and let a test assert on the
 *     points rather than on prose, and nothing has to parse English back
 *     into numbers later.
 *   - **The clock is a parameter.** `DateTime.UtcNow` was read inside the
 *     scorer, which makes freshness untestable and makes the same
 *     posting score differently depending on when the suite runs.
 *
 * Money is integer minor units, as everywhere else here: a pay floor is
 * a budget filter, and a budget filter built on binary floating point
 * eventually disagrees with itself.
 */

/** A posting as the boards give it, once normalised. */
export interface Posting {
  readonly title: string
  readonly description: string
  readonly location?: string
  readonly isRemote: boolean
  /** ISO, absent when the board does not say. */
  readonly postedAt?: string
  readonly salaryMinMinor?: number
  readonly salaryMaxMinor?: number
}

/** The rules deciding what counts as a lead. */
export interface SearchProfile {
  readonly titleIncludes: readonly string[]
  readonly titleExcludes: readonly string[]
  readonly keywordIncludes: readonly string[]
  readonly keywordExcludes: readonly string[]
  readonly locationIncludes: readonly string[]
  readonly remoteOnly: boolean
  readonly maxAgeDays?: number
  readonly minSalaryMinor?: number
}

export interface Reason {
  readonly points: number
  readonly text: string
}

export interface Scored {
  /** 0–100. Zero whenever `rejected` is set. */
  readonly score: number
  readonly reasons: readonly Reason[]
  /** Why a hard filter dropped it. Absent when it survived. */
  readonly rejected?: string
}

const TITLE_BASE = 50
const TITLE_PER_EXTRA_HIT = 5
const TITLE_MAX = 60
/** What a posting gets when no title filter is set at all. */
const NO_TITLE_FILTER = 30
const KEYWORD_MAX = 30

/** Beyond this a posting is more likely filled than live. */
const STALE_AFTER_DAYS = 90
const STALE_PENALTY = 8

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Terms as a person types them: newline or comma separated.
 *
 * Lower-cased and de-duplicated here so every comparison downstream is a
 * plain `includes` — the alternative is each call site remembering to
 * fold case, and one that forgets is a filter that silently stops
 * matching.
 */
export function parseTerms(raw: string): readonly string[] {
  return [
    ...new Set(
      raw
        .split(/[\n\r,]+/)
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term !== ''),
    ),
  ]
}

function has(haystack: string | undefined, term: string): boolean {
  return haystack?.toLowerCase().includes(term) === true
}

function quote(terms: readonly string[]): string {
  return terms.map((term) => `"${term}"`).join(', ')
}

/**
 * Whether a posting satisfies the wanted-locations list.
 *
 * **The list applies to remote roles too**, which is the part that looks
 * like a bug and is not: "Remote Poland" is still Poland. A bare
 * `remote` term is how somebody opts into remote-anywhere; `remote us`
 * or `denver` keeps it local.
 */
function matchesLocation(posting: Posting, wanted: readonly string[]): boolean {
  return (
    wanted.some((term) => has(posting.location, term)) ||
    (posting.isRemote && wanted.includes('remote'))
  )
}

export function scorePosting(posting: Posting, profile: SearchProfile, now: Date): Scored {
  const haystack = `${posting.title}\n${posting.description}`

  const blockedTitle = profile.titleExcludes.find((term) => has(posting.title, term))
  if (blockedTitle !== undefined) {
    return dropped(`Title contains excluded term ${quote([blockedTitle])}`)
  }

  const blockedKeyword = profile.keywordExcludes.find((term) => has(haystack, term))
  if (blockedKeyword !== undefined) {
    return dropped(`Posting contains excluded term ${quote([blockedKeyword])}`)
  }

  if (profile.remoteOnly && !posting.isRemote) return dropped('Not remote')

  if (profile.locationIncludes.length > 0 && !matchesLocation(posting, profile.locationIncludes)) {
    return dropped(`Location "${posting.location ?? 'unstated'}" is not one of the wanted ones`)
  }

  const age = ageInDays(posting, now)
  if (profile.maxAgeDays !== undefined && age !== undefined && age > profile.maxAgeDays) {
    return dropped(`Posted more than ${String(profile.maxAgeDays)} days ago`)
  }

  /*
   * Pay is only judged when the board publishes it, which most do not.
   * Dropping every posting that stays quiet about money would throw away
   * the majority of the board to enforce a floor nobody stated.
   */
  const ceiling = posting.salaryMaxMinor ?? posting.salaryMinMinor
  if (
    profile.minSalaryMinor !== undefined &&
    ceiling !== undefined &&
    ceiling < profile.minSalaryMinor
  ) {
    return dropped('Top of the published range is below the minimum')
  }

  const reasons: Reason[] = []
  let score = 0

  if (profile.titleIncludes.length === 0) {
    score += NO_TITLE_FILTER
    reasons.push({ points: NO_TITLE_FILTER, text: 'no title filter set' })
  } else {
    const hits = profile.titleIncludes.filter((term) => has(posting.title, term))
    if (hits.length === 0) return dropped('Title matches none of the wanted titles')

    const points = Math.min(TITLE_MAX, TITLE_BASE + (hits.length - 1) * TITLE_PER_EXTRA_HIT)
    score += points
    reasons.push({ points, text: `title matches ${quote(hits)}` })
  }

  if (profile.keywordIncludes.length > 0) {
    const hits = profile.keywordIncludes.filter((term) => has(haystack, term))
    /*
     * A *share* of the wanted keywords, which is why adding keywords you
     * rarely match lowers every score. That is the intended behaviour —
     * the list is for ranking, not for widening the net — and it is the
     * single most surprising thing about this scorer.
     */
    const points = Math.round((KEYWORD_MAX * hits.length) / profile.keywordIncludes.length)
    score += points
    reasons.push({
      points,
      text:
        hits.length > 0
          ? `${String(hits.length)}/${String(profile.keywordIncludes.length)} keywords: ${quote(hits)}`
          : `none of ${String(profile.keywordIncludes.length)} keywords found`,
    })
  }

  if (posting.isRemote) {
    score += 10
    reasons.push({ points: 10, text: 'remote' })
  } else if (profile.locationIncludes.length > 0) {
    const hit = profile.locationIncludes.find((term) => has(posting.location, term))
    if (hit !== undefined) {
      score += 10
      reasons.push({ points: 10, text: `location matches ${quote([hit])}` })
    }
  }

  if (posting.salaryMinMinor !== undefined || posting.salaryMaxMinor !== undefined) {
    score += 3
    reasons.push({ points: 3, text: 'pay published' })

    if (
      profile.minSalaryMinor !== undefined &&
      ceiling !== undefined &&
      ceiling >= profile.minSalaryMinor
    ) {
      score += 5
      reasons.push({ points: 5, text: 'clears the minimum' })
    }
  }

  if (age !== undefined) {
    const days = Math.floor(age)
    if (age <= 7) {
      score += 5
      reasons.push({ points: 5, text: `posted ${String(days)}d ago` })
    } else if (age <= 30) {
      score += 2
      reasons.push({ points: 2, text: `posted ${String(days)}d ago` })
    } else if (age > STALE_AFTER_DAYS) {
      /*
       * Penalised rather than dropped. A long-open req is often filled
       * or evergreen and occasionally still real, so it falls behind
       * fresher work instead of vanishing.
       */
      score -= STALE_PENALTY
      reasons.push({ points: -STALE_PENALTY, text: `stale: posted ${String(days)}d ago` })
    }
  }

  return { score: Math.min(100, Math.max(0, score)), reasons }
}

function ageInDays(posting: Posting, now: Date): number | undefined {
  if (posting.postedAt === undefined) return undefined

  const posted = Date.parse(posting.postedAt)
  if (Number.isNaN(posted)) return undefined

  return (now.getTime() - posted) / DAY_MS
}

function dropped(rejected: string): Scored {
  return { score: 0, reasons: [], rejected }
}
