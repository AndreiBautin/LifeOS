import { ALL_ACTS, SCORING } from '@/domain/game/registry'
import {
  daysLeftIn,
  isInSeason,
  monthsIn,
  previousSeason,
  seasonLabel,
  seasonOf,
  seasonProgress,
  toSeasonId,
  type SeasonKey,
} from '@/domain/game/season'
import { xpFrom } from '@/domain/game/xp'

import { tallyActs, type SheetDeps } from './sheet'

/**
 * The season you are in, as progress rather than as a verdict.
 *
 * This is the counterpart to the monthly review, and the two answer
 * different questions on purpose. The review is retrospective: it records
 * values and judges a *direction*, which needs stored snapshots because a
 * direction needs two points in time. This needs no snapshots at all —
 * every act carries a date, so "what have I done this winter" is derived
 * live from records that already exist, the same way the all-time tally
 * is.
 *
 * The target is **last season's XP**, not a tier curve.
 *
 * A battle pass normally has a hundred tiers at thresholds somebody chose,
 * and this app's whole model refuses scales it can move — "a scale the app
 * can move is a scale that means nothing". Your own previous season is a
 * real anchor: it is external to the season being measured, it moves only
 * because you moved it, and beating it means something specific. A first
 * season has nothing to beat and says so rather than inventing a number.
 */

export interface MonthProgress {
  /** `YYYY-MM`. */
  readonly month: string
  readonly xp: number
}

export interface AreaProgress {
  readonly area: string
  readonly name: string
  readonly xp: number
}

export interface SeasonProgress {
  readonly id: string
  readonly label: string
  readonly xp: number
  /** Last season's total, absent when there is no season before this one. */
  readonly target?: number
  /** How much of the season has elapsed, 0–1. */
  readonly elapsed: number
  readonly daysLeft: number
  /** The season's three months, in order, even the ones not yet begun. */
  readonly months: readonly MonthProgress[]
  /** Only areas that earned something, biggest first. */
  readonly areas: readonly AreaProgress[]
}

export interface SeasonDeps extends SheetDeps {
  readonly clock: SheetDeps['clock']
}

export async function seasonProgressFor(deps: SeasonDeps): Promise<SeasonProgress> {
  const now = deps.clock.now()
  const current = seasonOf(now)
  const previous = previousSeason(current)

  const [acts, lastActs] = await Promise.all([
    tallyActs(deps, (date) => isInSeason(current, date)),
    tallyActs(deps, (date) => isInSeason(previous, date)),
  ])

  const months = await Promise.all(
    monthsIn(current).map(async (month) => ({
      month,
      xp: xpFrom(await tallyActs(deps, (date) => date.slice(0, 7) === month), ALL_ACTS),
    })),
  )

  const areas = SCORING.map((area) => ({
    area: area.area,
    name: area.name,
    xp: area.acts.reduce((sum, act) => sum + act.points * (acts[act.id] ?? 0), 0),
  }))
    .filter((area) => area.xp > 0)
    .sort((a, b) => b.xp - a.xp)

  const target = xpFrom(lastActs, ALL_ACTS)

  return {
    id: toSeasonId(current),
    label: seasonLabel(current),
    xp: xpFrom(acts, ALL_ACTS),
    /*
     * Absent rather than zero when the previous season earned nothing —
     * "beat 0 XP" is not a goal, and a bar already full on day one is
     * worse than no bar. The same absent-never-zero rule the review
     * follows, for the same reason.
     */
    ...(target > 0 ? { target } : {}),
    elapsed: seasonProgress(current, now),
    daysLeft: daysLeftIn(current, now),
    months,
    areas,
  }
}

export type { SeasonKey }
