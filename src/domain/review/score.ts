import type { RatingOutcome } from '@/domain/game/rating'

import type { MetricTiers } from './metric'

/**
 * Turning judgements into numbers, and numbers into a level.
 *
 * Two different questions, deliberately kept apart. **Direction** asks
 * whether this moved; **tier** asks whether the number is any good at all.
 * A net worth that rose by a pound improved and may still be thin. A waist
 * that grew regressed and may still be excellent.
 */

/*
 * Deliberately simple, and not tuned against real data. The source said so
 * too, which is worth preserving rather than quietly replacing with
 * numbers that look more considered without being so.
 */
const IMPROVED = 100
const STAGNANT = 70
const REGRESSED = 30

export const TIERS = ['tier1', 'tier2', 'tier3', 'tier4'] as const
export type Tier = (typeof TIERS)[number]

/**
 * A judged outcome as a score, or nothing when there is no judgement.
 *
 * `insufficient-data` returns `undefined` rather than zero, and callers
 * must leave it out of an average rather than counting it. A metric you
 * have measured once is not a metric scoring nothing — that distinction is
 * the difference between an honest blank and a false alarm.
 */
export function scoreForOutcome(outcome: RatingOutcome): number | undefined {
  switch (outcome) {
    case 'improved':
      return IMPROVED
    case 'stagnant':
      return STAGNANT
    case 'regressed':
      return REGRESSED
    case 'insufficient-data':
      return undefined
  }
}

/** Which of the four bands a value falls in. */
export function tierFor(value: number, tiers: MetricTiers): Tier {
  const ascending = ascendingTier(value, tiers)
  return tiers.higherIsBetter ? ascending : invert(ascending)
}

function ascendingTier(value: number, tiers: MetricTiers): Tier {
  if (value <= tiers.tier1Max) return 'tier1'
  if (value <= tiers.tier2Max) return 'tier2'
  if (value <= tiers.tier3Max) return 'tier3'
  return 'tier4'
}

function invert(tier: Tier): Tier {
  const order: Record<Tier, Tier> = {
    tier1: 'tier4',
    tier2: 'tier3',
    tier3: 'tier2',
    tier4: 'tier1',
  }
  return order[tier]
}

/**
 * Where a value sits on the 0–100 scale the bands describe.
 *
 * The continuous answer rather than the coarse one, because two values in
 * the same band can be a long way apart: a net worth a pound past a cutoff
 * should not score the same as one most of the way to the next. Each of
 * the first three bands owns a 25-point slice, interpolated across it.
 *
 * The top band is flat 100, and that is a difference in kind rather than
 * an omission. Past every defined cutoff there is nothing further to
 * measure progress against, so there is no slice to interpolate — the same
 * reason `tierFor` treats it as one bucket rather than four more levels.
 */
export function scoreForValue(value: number, tiers: MetricTiers): number {
  const ascending = ascendingScore(value, tiers)
  return tiers.higherIsBetter ? ascending : 100 - ascending
}

function ascendingScore(value: number, tiers: MetricTiers): number {
  if (value <= tiers.tier1Max) {
    // Tier one has no configured floor, so zero stands in for one — or the
    // cutoff itself where that is already at or below zero.
    return interpolate(value, Math.min(0, tiers.tier1Max), tiers.tier1Max, 0, 25)
  }
  if (value <= tiers.tier2Max) return interpolate(value, tiers.tier1Max, tiers.tier2Max, 25, 50)
  if (value <= tiers.tier3Max) return interpolate(value, tiers.tier2Max, tiers.tier3Max, 50, 75)

  return 100
}

function interpolate(
  value: number,
  bandStart: number,
  bandEnd: number,
  scoreStart: number,
  scoreEnd: number,
): number {
  if (bandEnd <= bandStart) return scoreEnd

  const progress = Math.min(1, Math.max(0, (value - bandStart) / (bandEnd - bandStart)))
  return scoreStart + progress * (scoreEnd - scoreStart)
}

/**
 * One metric's contribution: the trend where there is one, the level where
 * there is not, and nothing at all when neither is available.
 *
 * The fallback matters more than it sounds. A metric recorded once has no
 * trend and, without this, would sit blank on the screen for a month while
 * its actual value was perfectly informative.
 */
export function contributionOf(
  outcome: RatingOutcome,
  latestValue: number | undefined,
  tiers: MetricTiers | undefined,
): number | undefined {
  const fromTrend = scoreForOutcome(outcome)
  if (fromTrend !== undefined) return fromTrend

  if (latestValue === undefined || tiers === undefined) return undefined
  return Math.round(scoreForValue(latestValue, tiers))
}

/**
 * Several contributions as one score, ignoring the ones that had nothing
 * to say.
 *
 * `undefined` rather than zero for an area with nothing scoreable — an
 * area you have not started measuring is not an area doing badly, and
 * averaging in a zero is how a blank becomes an accusation.
 */
export function blend(contributions: readonly (number | undefined)[]): number | undefined {
  const scored = contributions.filter((one): one is number => one !== undefined)
  if (scored.length === 0) return undefined

  return Math.round(scored.reduce((sum, one) => sum + one, 0) / scored.length)
}
