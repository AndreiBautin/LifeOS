import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'

import { STRENGTH_STANDARDS, TOTAL_STANDARDS } from './character'
import type { Ladder } from './ladder'
import type { Rating } from './rating'
import { TRAINING_ACTS, type ActDefinition } from './xp'

/**
 * Every area the hub will cover, and how each one is scored.
 *
 * This table is the reason phase 0 exists at all. Without it each
 * absorption invents its own notion of progress on the way in, and by the
 * time the seventh lands there are six incompatible ones to reconcile
 * after they have all shipped. Deciding it up front costs a day; deciding
 * it afterwards is a rewrite of everything that reads a number.
 *
 * Note what is *not* here: Dashboard's own categories. Those are rows in
 * a registry of its own — 98 setting definitions and a metric table — and
 * they stay data. This lists the seven areas that arrive as ported
 * domains, and the shape each one's numbers take when they do.
 */

export const LIFE_AREAS = ['training', 'cardio', 'mobility'] as const

export type LifeArea = (typeof LIFE_AREAS)[number]

export interface AreaScoring {
  readonly area: LifeArea
  readonly name: string
  /** The phase of the absorption sequence that lands it. 0 = already here. */
  readonly phase: number
  readonly ladders: readonly Ladder[]
  readonly ratings: readonly Rating[]
  readonly acts: readonly ActDefinition[]
}

const STRENGTH_ANCHOR = 'ExRx and Symmetric Strength, as multiples of bodyweight'

/**
 * Training's ladders are derived from `character.ts`, not restated.
 *
 * A second copy of the strength standards would be a second answer to
 * "what counts as Advanced", and the two would part company the first
 * time either was tuned.
 */
const STRENGTH_LADDERS: readonly Ladder[] = [
  {
    id: 'training.squat',
    source: 'training.squat-e1rm',
    name: 'Squat',
    unit: 'lb',
    anchor: STRENGTH_ANCHOR,
    thresholds: STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.squat] ?? [],
  },
  {
    id: 'training.bench',
    source: 'training.bench-e1rm',
    name: 'Bench press',
    unit: 'lb',
    anchor: STRENGTH_ANCHOR,
    thresholds: STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.bench] ?? [],
  },
  {
    id: 'training.deadlift',
    source: 'training.deadlift-e1rm',
    name: 'Deadlift',
    unit: 'lb',
    anchor: STRENGTH_ANCHOR,
    thresholds: STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.deadlift] ?? [],
  },
  {
    id: 'training.total',
    source: 'training.total',
    name: 'Powerlifting total',
    unit: 'lb',
    anchor: STRENGTH_ANCHOR,
    thresholds: TOTAL_STANDARDS,
  },
]

export const SCORING: readonly AreaScoring[] = [
  {
    area: 'training',
    name: 'Training',
    phase: 0,
    ladders: STRENGTH_LADDERS,
    ratings: [
      {
        id: 'training.consistency',
        source: 'training.sessions-in-month',
        name: 'Consistency',
        unit: 'sessions',
        direction: 'stay-above',
        cadence: 'monthly',
        threshold: 12,
      },
    ],
    acts: TRAINING_ACTS,
  },
  {
    /*
     * **Conditioning, as its own area, and that is what makes Stamina
     * possible at all.** A trait re-presents the XP of the areas it
     * claims, and an area belongs to exactly one trait — so cardio could
     * not live inside `training` and feed a second bar. Splitting it out
     * is the whole mechanism.
     *
     * It is not a second training area in any other sense: the programme
     * still schedules conditioning as part of a session, the sets still
     * pay `training.working-set-logged`, and nothing about how it is
     * planned or logged changed. What changed is which bar the doing of
     * it shows up under.
     *
     * **No ladder.** There was one once and it was removed for being a
     * mile time nobody was running — a fixed Untrained on a screen whose
     * job is to show movement. Nothing here measures conditioning
     * against a published standard, so nothing scores it that way.
     */
    area: 'cardio',
    name: 'Conditioning',
    phase: 13,
    ladders: [],
    ratings: [],
    acts: [
      {
        id: 'cardio.session-logged',
        area: 'cardio',
        label: 'Did the conditioning',
        /*
         * **30, against a session's 50.** Conditioning usually rides
         * along with a lifting session rather than replacing it, so this
         * fires on a day that has often already paid for the session and
         * its sets. Matching 50 would make Stamina climb fastest on
         * heavy days, which is precisely the wrong reading.
         */
        points: 30,
      },
    ],
  },
  {
    /*
     * **Mobility is the warm-up, done.** Asked for when the app narrowed
     * to a workout tracker: _"you can level up strength, stamina, and
     * mobility."_ Every session already opens on warm-up rows — foam
     * rolling and drills, one row per thing you do — so the evidence was
     * being logged all along and paid nothing.
     *
     * Its own area for the reason conditioning is: a trait claims areas,
     * and an area feeds exactly one trait, so warm-ups could not stay in
     * `training` and show under a second bar.
     *
     * **Per session, not per row.** Six warm-up rows paying six times
     * would make the cheapest part of a session the best-paid, so it
     * fires once on a finished session with at least one warm-up row
     * actually done — the shape `cardio.session-logged` already has.
     */
    area: 'mobility',
    name: 'Mobility',
    phase: 15,
    ladders: [],
    ratings: [],
    acts: [{ id: 'mobility.warm-up-done', area: 'mobility', label: 'Did the warm-up', points: 20 }],
  },
]

export const ALL_LADDERS: readonly Ladder[] = SCORING.flatMap((area) => area.ladders)
export const ALL_RATINGS: readonly Rating[] = SCORING.flatMap((area) => area.ratings)
export const ALL_ACTS: readonly ActDefinition[] = SCORING.flatMap((area) => area.acts)

/**
 * One act, by id.
 *
 * The registry is the only place an act's worth is written down, so
 * anything that wants to *show* what something paid has to read it from
 * here rather than restating the number. A screen with its own copy of
 * "a daily is 15" is a second answer waiting to disagree with
 * `tallyActs`, and it would disagree silently — the sheet would say one
 * thing and the acknowledgement another, both looking authoritative.
 */

export function actById(id: string): ActDefinition | undefined {
  return ALL_ACTS.find((act) => act.id === id)
}
