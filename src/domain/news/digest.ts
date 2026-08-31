import { NEWS_SOURCES, type NewsSource, type Story } from './story'

/**
 * What the morning digest reads, and what floats to the top of it.
 *
 * **Interests rank; they do not gate.** This is the one place the job
 * scorer's shape was deliberately not copied. There, a keyword is a
 * *share* of the wanted list, so adding one you rarely match lowers
 * every score — a rule with a test saying so precisely because it reads
 * as a bug the first time somebody meets it. A digest has no such
 * excuse: the front page is thirty items, a person wants the ones about
 * their subjects near the top, and hiding the rest turns a digest into a
 * filter bubble they configured by accident.
 *
 * **Mutes do gate**, because that is what a mute is. A subject you have
 * decided not to read about should not appear at position thirty either.
 */

export interface DigestPreferences {
  readonly sources: readonly NewsSource[]
  /** Subjects to float to the top. Ranking only. */
  readonly interests: readonly string[]
  /** Subjects to drop outright. */
  readonly mutes: readonly string[]
  /**
   * The floor a story must clear to appear at all.
   *
   * A points threshold rather than a score this app invented: the number
   * is the source's own, and every reader of it knows what a
   * hundred-point HN story means. Zero shows everything the sources
   * returned.
   */
  readonly minimumPoints: number
  /**
   * How many make the digest.
   *
   * A cap rather than a page, because the whole claim of a digest is
   * that it ends. A list that scrolls is a feed, which is the failure
   * mode this feature has to stay on the right side of.
   */
  readonly limit: number
}

export const DEFAULT_DIGEST: DigestPreferences = {
  sources: [...NEWS_SOURCES],
  interests: [],
  mutes: [],
  minimumPoints: 50,
  limit: 12,
}

/** Splits "typescript, rust" into terms, the way the job filters do. */
export function parseInterests(raw: string): readonly string[] {
  return [
    ...new Set(
      raw
        .split(/[\n\r,]+/)
        .map((term) => term.trim().toLowerCase())
        .filter((term) => term !== ''),
    ),
  ]
}

function mentions(story: Story, term: string): boolean {
  return (
    story.title.toLowerCase().includes(term) ||
    story.tags.some((tag) => tag.toLowerCase().includes(term))
  )
}

/** How many of your interests a story touches. Zero is fine. */
export function interestHits(story: Story, interests: readonly string[]): number {
  return interests.filter((term) => mentions(story, term)).length
}

export interface RankedStory {
  readonly story: Story
  /** How many interests it matched — shown, so the order is explainable. */
  readonly hits: number
}

/**
 * The digest: muted out, floor applied, interests first, capped.
 *
 * Sorted by interest hits and then by the source's own points. Nothing
 * here computes a score of its own — a blended number would be this app
 * inventing a scale for how good an article is, which is the thing it
 * refuses everywhere, and it would make the order unexplainable on a
 * screen that has room for one line of reason.
 */
export function rankDigest(
  stories: readonly Story[],
  preferences: DigestPreferences,
): readonly RankedStory[] {
  const muted = preferences.mutes.map((term) => term.toLowerCase()).filter((term) => term !== '')

  return stories
    .filter((story) => story.points >= preferences.minimumPoints)
    .filter((story) => !muted.some((term) => mentions(story, term)))
    .map((story) => ({ story, hits: interestHits(story, preferences.interests) }))
    .sort(
      (a, b) =>
        b.hits - a.hits ||
        b.story.points - a.story.points ||
        a.story.title.localeCompare(b.story.title),
    )
    .slice(0, Math.max(0, preferences.limit))
}

/**
 * Reads a stored digest preference back, treating it as untrusted.
 *
 * Built field by field like every other parse here: this arrives from
 * `localStorage` or from another device, and asserting it is already the
 * right shape is how a validator ends up checking conditions the
 * compiler has decided cannot fail.
 */
export function parseDigestPreferences(value: unknown): DigestPreferences {
  if (typeof value !== 'object' || value === null) return DEFAULT_DIGEST

  const bag = value as Record<string, unknown>

  const terms = (raw: unknown): readonly string[] =>
    Array.isArray(raw)
      ? raw.filter((one): one is string => typeof one === 'string' && one.trim() !== '')
      : []

  const number = (raw: unknown, fallback: number, min: number, max: number): number =>
    typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(max, Math.max(min, Math.round(raw)))
      : fallback

  return {
    sources: Array.isArray(bag.sources)
      ? NEWS_SOURCES.filter((source) => (bag.sources as unknown[]).includes(source))
      : DEFAULT_DIGEST.sources,
    interests: terms(bag.interests),
    mutes: terms(bag.mutes),
    minimumPoints: number(bag.minimumPoints, DEFAULT_DIGEST.minimumPoints, 0, 1000),
    /*
     * Clamped rather than trusted. A stored limit of zero would produce
     * an empty digest every morning with nothing on any screen able to
     * say why, and a huge one turns the card into the feed this is
     * written not to be.
     */
    limit: number(bag.limit, DEFAULT_DIGEST.limit, 1, 50),
  }
}

/** Whether there is anywhere to read from. */
export function canRead(preferences: DigestPreferences): boolean {
  return preferences.sources.length > 0
}
