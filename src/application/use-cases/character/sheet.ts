import { traitStandings, type TraitStanding } from '@/domain/game/traits'
import { readLadder, type LadderReading } from '@/domain/game/ladder'
import { ALL_ACTS, SCORING } from '@/domain/game/registry'
import { standing, xpFrom, type XpStanding } from '@/domain/game/xp'
import { hasConditioning, hasWarmUp, totalWorkingSets } from '@/domain/logging/workout-log'
import type { RatingOutcome } from '@/domain/game/rating'

import { measureAll } from '../review/measure'
import { readout, type ReviewDeps } from '../review/review'

/**
 * The character sheet, over every area rather than only strength.
 *
 * This is the join the game model was written for: `domain/game/registry.ts`
 * declares what each area has — ladders, ratings, acts — and this turns
 * those declarations into one readout. Nothing here restates the registry,
 * so an area gains a level on this page by gaining a row there.
 *
 * The three currencies keep their separate jobs, and the separation is the
 * point of the whole model:
 *
 * **Ladders** are read from *live* measurements. A ladder is anchored to
 * something external — a strength standard, a region's boundary — and its
 * answer does not depend on whether you opened the review this month.
 *
 * **Ratings** are read from what the monthly review *recorded*. They are
 * judgements about a direction over time, and letting today's number join
 * the series silently would make a monthly rating shift every time the
 * page was opened.
 *
 * **XP** is a tally of acts, and every act is counted from records that
 * already exist rather than from a log of its own. That is deliberate: a
 * separate act log would be a second copy of the truth, and one that
 * double-counts the moment a backup is restored. Counting visited places
 * cannot drift from the places.
 */

export interface LadderStanding {
  readonly id: string
  readonly name: string
  readonly unit: string
  readonly anchor: string
  /** Absent when nothing has been measured — never a plausible zero. */
  readonly reading?: LadderReading
  readonly value?: number
}

export interface RatingStanding {
  readonly id: string
  readonly name: string
  /**
   * The last judgement recorded.
   *
   * `insufficient-data` is a real value here rather than an absence — the
   * evaluator returns it for a series too short to have a direction, which
   * is a different statement from "this rating does not exist". It counts
   * as *silence* for the purpose of `AreaStanding.silent`, because an area
   * whose every rating is waiting for a second data point has nothing to
   * report yet.
   */
  readonly outcome?: RatingOutcome
  readonly value?: number
}

/** Whether a rating has actually judged anything. */
function hasJudged(outcome: RatingOutcome | undefined): boolean {
  return outcome !== undefined && outcome !== 'insufficient-data'
}

export interface AreaStanding {
  readonly area: string
  readonly name: string
  readonly ladders: readonly LadderStanding[]
  readonly ratings: readonly RatingStanding[]
  /** XP earned in this area, all time. */
  readonly xp: number
  /** True when nothing in the area has anything to say yet. */
  readonly silent: boolean
}

export interface CharacterSheet {
  readonly areas: readonly AreaStanding[]
  readonly standing: XpStanding
  /**
   * The same XP, re-presented as traits.
   *
   * Not a fourth currency and not a second tally: each area belongs to
   * exactly one trait, so these sum to `standing.xp` exactly. See
   * `domain/game/traits.ts`.
   */
  readonly traits: readonly TraitStanding[]
  /** Every area blended by the review's spine, absent when nothing scored. */
  readonly score?: number
  readonly acts: Readonly<Record<string, number>>
}

/**
 * The review's dependencies, plus the challenge marks.
 *
 * **Added here rather than to `MeasureDeps`**, which is the review
 * spine's own list: nothing in the monthly readout measures challenges,
 * and widening that interface would make every evaluator and every test
 * double carry a repository none of them ask about.
 */
export type SheetDeps = ReviewDeps

/**
 * When an act happened, for the ones that can say.
 *
 * Every act is dated by the record it is derived from — a workout's
 * `date`, a progress entry's `date`, an action's `completedAt`, a place's
 * `dateVisited`. That is what lets one tally serve "all time" and "this
 * season" without a second implementation to drift from the first.
 */
export type Within = (isoDate: string) => boolean

const ALWAYS: Within = () => true

/**
 * How many times each act has happened, counted from the records.
 *
 * Every entry here is a derivation, not a read of a stored counter. The
 * alternative — incrementing a total when something happens — cannot
 * survive two devices, because both increment it and last-write-wins
 * throws one away. It cannot survive a restore either.
 *
 * An act the hub cannot yet witness is simply absent, which costs zero XP
 * rather than a wrong number. So is an act whose record carries no date —
 * in **every** window, the all-time one included. That looks strict and is
 * the only choice that keeps all-time equal to the sum of the seasons:
 * counting an undated act once in the total and never in a season would
 * leave two numbers on the same screen that quietly disagree. Every
 * operation that performs an act stamps it, so this only excludes records
 * that were already malformed.
 */
export async function tallyActs(
  deps: SheetDeps,
  within: Within = ALWAYS,
): Promise<Readonly<Record<string, number>>> {
  return countActs(await loadActRecords(deps), within)
}

/**
 * Every record an act can be read from, loaded once.
 *
 * Split from the counting so a caller asking many windows of the same
 * records — the activity heatmap asks one per day — reads each store
 * once rather than once per window.
 */
export interface ActRecords {
  readonly workouts: Awaited<ReturnType<SheetDeps['workouts']['recent']>>
}

export async function loadActRecords(deps: SheetDeps): Promise<ActRecords> {
  return { workouts: await deps.workouts.recent(500) }
}

/**
 * Every act, counted off the workout log.
 *
 * **One record type pays everything now.** The app is a workout tracker,
 * so each act is a question asked of the same completed sessions: was it
 * finished, which sets were worked, was there conditioning in it, was the
 * warm-up done. Nothing new is logged for any of them, and nothing is
 * counted twice — they are different acts, the way finishing a session
 * and logging its sets always were.
 */
export function countActs(
  records: ActRecords,
  within: Within = ALWAYS,
): Readonly<Record<string, number>> {
  const completed = records.workouts.filter((log) => log.status === 'completed' && within(log.date))

  return {
    'training.session-finished': completed.length,
    'training.working-set-logged': completed.reduce(
      (total, log) => total + totalWorkingSets(log),
      0,
    ),
    /*
     * Flat, so a twenty-minute walk and a brutal interval session are
     * worth the same. Paying by duration would make the easy work the
     * programme leans on the least valuable thing in it.
     */
    'cardio.session-logged': completed.filter(hasConditioning).length,
    'mobility.warm-up-done': completed.filter(hasWarmUp).length,
  }
}

export async function characterSheet(deps: SheetDeps): Promise<CharacterSheet> {
  const [measured, recorded, acts] = await Promise.all([
    measureAll(deps),
    readout(deps),
    tallyActs(deps),
  ])

  const byArea = new Map(recorded.areas.map((reading) => [reading.area, reading]))

  const areas = SCORING.map((area): AreaStanding => {
    const ladders = area.ladders.map((ladder): LadderStanding => {
      const value = measured[ladder.source]

      return {
        id: ladder.id,
        name: ladder.name,
        unit: ladder.unit,
        anchor: ladder.anchor,
        ...(value === undefined ? {} : { value, reading: readLadder(ladder, value) }),
      }
    })

    const reading = byArea.get(area.area)
    const ratings = area.ratings.map((rating): RatingStanding => {
      const recordedMetric = reading?.metrics.find((one) => one.metric.id === rating.id)

      return {
        id: rating.id,
        name: rating.name,
        ...(recordedMetric?.outcome === undefined ? {} : { outcome: recordedMetric.outcome }),
        ...(recordedMetric?.latest === undefined ? {} : { value: recordedMetric.latest }),
      }
    })

    const xp = area.acts.reduce((sum, act) => sum + act.points * (acts[act.id] ?? 0), 0)

    return {
      area: area.area,
      name: area.name,
      ladders,
      ratings,
      xp,
      silent:
        xp === 0 &&
        ladders.every((one) => one.reading === undefined) &&
        !ratings.some((one) => hasJudged(one.outcome)),
    }
  })

  return {
    areas,
    standing: standing(xpFrom(acts, ALL_ACTS)),
    traits: traitStandings(acts, ALL_ACTS),
    ...(recorded.score === undefined ? {} : { score: recorded.score }),
    acts,
  }
}
