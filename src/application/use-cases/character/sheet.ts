import { isResolved } from '@/domain/atlas/place/Place'
import { readLadder, type LadderReading } from '@/domain/game/ladder'
import { ALL_ACTS, SCORING } from '@/domain/game/registry'
import { standing, xpFrom, type XpStanding } from '@/domain/game/xp'
import { totalWorkingSets } from '@/domain/logging/workout-log'
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
  /** Every area blended by the review's spine, absent when nothing scored. */
  readonly score?: number
  readonly acts: Readonly<Record<string, number>>
}

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
  const [workouts, items, projects, places, dailies] = await Promise.all([
    deps.workouts.recent(500),
    deps.items.all(),
    deps.projects.all(),
    deps.places.all(),
    deps.dailies.all(),
  ])

  /** No date, no act — see the note above on why this holds even all-time. */
  const dated = (date: string | undefined): boolean => date !== undefined && within(date)

  const completed = workouts.filter((log) => log.status === 'completed' && within(log.date))

  return {
    'training.session-finished': completed.length,
    'training.working-set-logged': completed.reduce(
      (total, log) => total + totalWorkingSets(log),
      0,
    ),
    // One act per item per day with progress on it. Entries are already
    // keyed by day, so logging twice against the same item on the same
    // afternoon is one act rather than two.
    'backlog.progress-logged': items.reduce(
      (total, item) =>
        total + item.dailyProgress.filter((entry) => entry.amount > 0 && within(entry.date)).length,
      0,
    ),
    // Counted from `dateCompleted` rather than from the status, so an item
    // reopened and finished again is one finish and not two — the stamp is
    // set once, on the first completion.
    'backlog.item-finished': items.filter((item) => dated(item.dateCompleted)).length,
    'projects.action-closed': projects.reduce(
      (total, project) =>
        total +
        project.actions.filter((action) => action.status === 'done' && dated(action.completedAt))
          .length,
      0,
    ),
    /*
     * `social.hangout-logged` is deliberately absent, and it is the one
     * act the registry declares that cannot be counted.
     *
     * A friend record keeps `lastHangout` — one date, ratcheted forward —
     * not a list of them. So the hub knows *when you last saw someone* and
     * has no idea how many times you have. Counting friends-with-a-date
     * would be a number that stops growing after the first coffee, which
     * is worse than no number: it would read as a social life that
     * happened once.
     *
     * Fixing it means storing hangouts as events, which is a real change
     * to the social domain and a migration. Until then this costs 0 XP
     * rather than a wrong amount of it.
     */
    /*
     * One act per day kept, and every completion is a day key — so a
     * habit's XP lands in the season it was kept in rather than all of it
     * in whichever season you happen to be reading.
     */
    'dailies.completed': dailies.reduce(
      (total, daily) => total + daily.done.filter((day) => within(day)).length,
      0,
    ),
    'places.place-visited': places.filter(
      (place) => place.status === 'visited' && isResolved(place) && dated(place.dateVisited),
    ).length,
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
    ...(recorded.score === undefined ? {} : { score: recorded.score }),
    acts,
  }
}
