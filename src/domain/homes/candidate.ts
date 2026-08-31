import type { HomeCandidateId } from '@/domain/ids/ids'

import { NEARBY_KINDS, type NearbyKind, type Neighbourhood } from './neighbourhood'

/**
 * A house you are considering, and what you want from one.
 *
 * **Typed in, because listings cannot be fetched.** Zillow, Redfin and
 * Realtor.com were all tested and all send no CORS header, so a browser
 * cannot read them — this is the same arrangement the resume has, and
 * for the same reason. What the app *can* do is measure the
 * neighbourhood around the address and score the whole thing against
 * what you said you wanted.
 *
 * **Every point is explainable**, which is the property carried over
 * from the job scorer rather than the scoring itself. A house at 74 can
 * say which points it earned and which it lost, and nothing is a model.
 */

export const CANDIDATE_STANDINGS = ['considering', 'viewed', 'offered', 'rejected'] as const

export type CandidateStanding = (typeof CANDIDATE_STANDINGS)[number]

export const STANDING_LABELS: Record<CandidateStanding, string> = {
  considering: 'Considering',
  viewed: 'Viewed',
  offered: 'Offered on',
  rejected: 'Ruled out',
}

export interface HomeCandidate {
  readonly id: HomeCandidateId
  /** As you would say it — "14 Maple Street". */
  readonly address: string
  /** Where the geocoder put it. Absent until it has been resolved. */
  readonly point?: { readonly latitude: number; readonly longitude: number }
  /** Asking price, in minor units, like every other money figure here. */
  readonly priceMinor?: number
  readonly beds?: number
  readonly baths?: number
  /** The listing, so it can be reopened. */
  readonly link?: string
  readonly standing: CandidateStanding
  /**
   * The last read of what is around it.
   *
   * Stored rather than fetched on every render, because Overpass is a
   * free service that took four and a half seconds for one query. OSM
   * changes over months, so a reading from last week is a fair answer —
   * and `readAt` is kept so the screen can say how old it is rather than
   * implying it is live.
   */
  readonly neighbourhood?: Neighbourhood
  readonly notes?: string
  readonly createdAt: string
  /** Written by the repository, never here. */
  readonly updatedAt?: string
}

/**
 * What you are looking for.
 *
 * **Wants, not filters.** Nothing here drops a candidate: a house over
 * budget is a house over budget and you may still want to look at it,
 * and a list that silently hid it would be the app deciding what you get
 * to consider. Every want moves the score and says so.
 */
export interface HomeWants {
  /** The top of the budget, in minor units. */
  readonly maxPriceMinor?: number
  readonly minBeds?: number
  /** The kinds worth having nearby. Order is not significance. */
  readonly wanted: readonly NearbyKind[]
  /** How far counts as nearby, in metres. */
  readonly radiusMetres: number
}

export const DEFAULT_WANTS: HomeWants = {
  wanted: ['groceries', 'parks', 'transit'],
  /*
   * A mile and a half of walking, roughly. Far enough that a city block
   * with one shop on it does not read as empty, near enough that
   * "nearby" still means something you would walk to.
   */
  radiusMetres: 1500,
}

export interface Reason {
  readonly points: number
  readonly text: string
}

export interface Scored {
  /** 0–100. */
  readonly score: number
  readonly reasons: readonly Reason[]
  /**
   * Wants that have never been looked for at this address.
   *
   * Reported so a screen can offer to read it again, rather than showing
   * a silently lower score — which is what a stale reading would produce
   * the moment somebody adds a kind to their wants.
   */
  readonly unmeasured: readonly NearbyKind[]
  /** True when nothing has been measured or stated to judge it on. */
  readonly unproven: boolean
}

const PRICE_POINTS = 35
const BEDS_POINTS = 15
const NEARBY_POINTS = 50

/**
 * Enough of a kind that more stops mattering.
 *
 * Three supermarkets within a mile is a well-served address and the
 * thirtieth adds nothing — a raw count would rank a dense city centre
 * above everywhere else on every kind, which is a fact about density
 * rather than about whether the address suits you.
 */
const ENOUGH = 3

/**
 * Scores a candidate against what you want, explaining every point.
 *
 * **Absent, never zero.** A candidate with no price stated and no
 * neighbourhood read is *unproven* rather than a zero — a bar at nought
 * would read as a bad house when nothing has been measured, which is the
 * rule every other reading in this app follows.
 */
export function scoreCandidate(candidate: HomeCandidate, wants: HomeWants): Scored {
  const reasons: Reason[] = []
  let score = 0

  const priceKnown = candidate.priceMinor !== undefined && wants.maxPriceMinor !== undefined

  /*
   * Only the kinds that were actually looked for.
   *
   * **A count of zero for a kind nobody queried is not a zero, it is an
   * absence** — and scoring it would drop a house against something
   * never measured. That happens the moment somebody adds a kind to
   * their wants: the stored reading was taken before they wanted it.
   * Caught by reading a real Manhattan address, where `schools: 0` sat
   * beside 543 parks purely because schools had not been asked for.
   */
  const measured = wants.wanted.filter(
    (kind) => candidate.neighbourhood?.asked?.includes(kind) === true,
  )
  const nearbyKnown = candidate.neighbourhood !== undefined && measured.length > 0

  if (priceKnown) {
    const price = candidate.priceMinor ?? 0
    const budget = wants.maxPriceMinor ?? 0

    if (price <= budget) {
      /*
       * Full marks for being inside the budget, and no more for being
       * cheaper. A house at half the budget is not twice as good — it is
       * a different house, and rewarding cheapness would rank the worst
       * affordable option above the best one.
       */
      score += PRICE_POINTS
      reasons.push({ points: PRICE_POINTS, text: 'Within budget' })
    } else {
      /*
       * Over budget loses points in proportion rather than all at once,
       * because ten percent over is a conversation and double is not.
       */
      const over = (price - budget) / budget
      const kept = Math.max(0, Math.round(PRICE_POINTS * (1 - Math.min(1, over * 2))))
      score += kept
      reasons.push({
        points: kept - PRICE_POINTS,
        text: `${String(Math.round(over * 100))}% over budget`,
      })
    }
  }

  if (wants.minBeds !== undefined && candidate.beds !== undefined) {
    if (candidate.beds >= wants.minBeds) {
      score += BEDS_POINTS
      reasons.push({ points: BEDS_POINTS, text: `${String(candidate.beds)} bedrooms` })
    } else {
      reasons.push({
        points: -BEDS_POINTS,
        text: `${String(candidate.beds)} bedrooms, wanted ${String(wants.minBeds)}`,
      })
    }
  }

  if (nearbyKnown) {
    // No optional chain: `nearbyKnown` reads the neighbourhood, and
    // TypeScript carries that narrowing through the alias.
    const counts = candidate.neighbourhood.counts
    // Shared across the kinds actually measured, so a want nobody has
    // looked for yet does not dilute the ones that were.
    const each = NEARBY_POINTS / measured.length

    for (const kind of measured) {
      const found = counts[kind]
      /*
       * Capped at `ENOUGH`, so the points are "is this served" rather
       * than "how dense is it". Partial credit below the cap, because
       * one supermarket is genuinely better than none.
       */
      const earned = Math.round(each * Math.min(1, found / ENOUGH))
      score += earned

      reasons.push({
        points: earned,
        text: found === 0 ? `No ${kind} within reach` : `${String(found)} ${kind} nearby`,
      })
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    unmeasured: wants.wanted.filter((kind) => !measured.includes(kind)),
    unproven: !priceKnown && !nearbyKnown,
  }
}

/** Best first, with the unproven ones after everything judged. */
export function ranked(
  candidates: readonly HomeCandidate[],
  wants: HomeWants,
): readonly { readonly candidate: HomeCandidate; readonly scored: Scored }[] {
  return candidates
    .map((candidate) => ({ candidate, scored: scoreCandidate(candidate, wants) }))
    .sort(
      (a, b) =>
        Number(a.scored.unproven) - Number(b.scored.unproven) ||
        b.scored.score - a.scored.score ||
        a.candidate.address.localeCompare(b.candidate.address),
    )
}

/** Reads stored wants back, treating them as the untrusted blob they are. */
export function parseWants(value: unknown): HomeWants {
  if (typeof value !== 'object' || value === null) return DEFAULT_WANTS

  const bag = value as Record<string, unknown>

  const positive = (raw: unknown): number | undefined =>
    typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : undefined

  const maxPriceMinor = positive(bag.maxPriceMinor)
  const minBeds = positive(bag.minBeds)
  const radius = positive(bag.radiusMetres)

  return {
    wanted: Array.isArray(bag.wanted)
      ? NEARBY_KINDS.filter((kind) => (bag.wanted as unknown[]).includes(kind))
      : DEFAULT_WANTS.wanted,
    /*
     * Clamped rather than trusted. A stored radius of 50 km would ask
     * Overpass for a whole county and time out, which reads as the
     * feature being broken.
     */
    radiusMetres: Math.min(5000, Math.max(200, radius ?? DEFAULT_WANTS.radiusMetres)),
    ...(maxPriceMinor === undefined ? {} : { maxPriceMinor }),
    ...(minBeds === undefined ? {} : { minBeds }),
  }
}
