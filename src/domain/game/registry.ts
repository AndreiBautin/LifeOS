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

export const LIFE_AREAS = [
  'training',
  'backlog',
  'projects',
  'upgrades',
  'social',
  'places',
  'dailies',
  'jobs',
  'base',
  'vitals',
] as const

export type LifeArea = (typeof LIFE_AREAS)[number]

export interface AreaScoring {
  readonly area: LifeArea
  readonly name: string
  /** The phase of the absorption sequence that lands it. 0 = already here. */
  readonly phase: number
  readonly ladders: readonly Ladder[]
  readonly ratings: readonly Rating[]
  readonly acts: readonly ActDefinition[]
  /** True for the one area that spends rather than measures. */
  readonly hasTree: boolean
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
    hasTree: false,
  },
  {
    area: 'backlog',
    name: 'Backlog',
    phase: 1,
    ladders: [],
    ratings: [
      {
        id: 'backlog.age',
        source: 'backlog.median-age-days',
        name: 'Backlog age',
        unit: 'days',
        direction: 'decrease',
        cadence: 'monthly',
      },
    ],
    acts: [
      {
        id: 'backlog.progress-logged',
        area: 'backlog',
        label: 'Logged progress on something',
        points: 5,
      },
      { id: 'backlog.item-finished', area: 'backlog', label: 'Finished something', points: 40 },
    ],
    hasTree: false,
  },
  {
    area: 'projects',
    name: 'Projects',
    phase: 2,
    ladders: [],
    ratings: [
      {
        id: 'projects.throughput',
        source: 'projects.actions-closed-in-month',
        name: 'Throughput',
        unit: 'actions',
        direction: 'increase',
        cadence: 'monthly',
      },
    ],
    /*
     * Split by quest kind, and paid from the kind recorded **on the
     * action** rather than the one on the quest today.
     *
     * The kind is a label somebody can change, so reading it live would
     * mean promoting a side quest silently repriced every action already
     * closed against it — and demoting one would make XP go *down*. A
     * closed action carries `completedAsKind`, which is a fact about the
     * moment and cannot be edited by relabelling.
     */
    acts: [
      {
        id: 'projects.main-action-closed',
        area: 'projects',
        label: 'Closed a main quest step',
        points: 40,
      },
      {
        id: 'projects.side-action-closed',
        area: 'projects',
        label: 'Closed a side quest step',
        points: 20,
      },
    ],
    hasTree: false,
  },
  {
    /*
     * The one area with a tree and no acts.
     *
     * Buying a node is not paid for in XP, and neither is it paid *with*
     * XP — the node is what the tree is for, and awarding points for
     * reaching it would count the same thing twice in the direction that
     * matters least. The gates are money and physical prerequisites, both
     * of which are real outside the app.
     */
    area: 'upgrades',
    name: 'Upgrades',
    phase: 3,
    ladders: [],
    ratings: [
      {
        id: 'upgrades.progress',
        source: 'upgrades.owned-share',
        name: 'Purchase progress',
        unit: 'share of planned',
        direction: 'increase',
        cadence: 'monthly',
      },
    ],
    acts: [],
    hasTree: true,
  },
  {
    area: 'social',
    name: 'Social',
    phase: 4,
    ladders: [],
    ratings: [
      {
        id: 'social.contact',
        source: 'social.contacts-in-month',
        name: 'Contact frequency',
        unit: 'people seen',
        direction: 'stay-above',
        cadence: 'monthly',
        threshold: 4,
      },
    ],
    acts: [{ id: 'social.hangout-logged', area: 'social', label: 'Saw somebody', points: 40 }],
    hasTree: false,
  },
  {
    area: 'dailies',
    name: 'Dailies',
    phase: 9,
    /*
     * No ladder, and no external anchor to hang one on. Nobody publishes
     * what share of your habits a person ought to keep, and a threshold
     * invented here would be the "scale the app can move" this model
     * refuses everywhere else. What a habit has instead is a streak, which
     * is not a level: it says how long, not how far.
     */
    ladders: [],
    ratings: [
      {
        id: 'dailies.kept',
        source: 'dailies.kept-share-in-month',
        name: 'Kept',
        unit: '% of days expected',
        direction: 'stay-above',
        cadence: 'monthly',
        threshold: 80,
      },
    ],
    /*
     * Paid per completion, not per streak. A streak is an *outcome* — it
     * is what happened to have worked — and paying XP for it would be the
     * rule against feeding a currency from an outcome, broken in the one
     * area where the temptation is strongest.
     */
    acts: [{ id: 'dailies.completed', area: 'dailies', label: 'Kept a daily', points: 15 }],
    hasTree: false,
  },
  {
    area: 'base',
    name: 'Base',
    phase: 10,
    /*
     * No ladder, for the reason the dailies give: nobody publishes how
     * well-maintained a house ought to be, and a threshold invented here
     * would be a scale this app can move — the one thing the model
     * refuses everywhere.
     *
     * The tempting substitute is a count of outstanding jobs. That is an
     * inventory rather than a standard: a house with four open jobs is
     * not worse than one with two, it is bigger, older, or more honestly
     * recorded.
     */
    ladders: [],
    ratings: [
      {
        id: 'base.chores-kept',
        source: 'base.chore-share-in-month',
        name: 'Chores kept',
        unit: '% of days expected',
        direction: 'stay-above',
        cadence: 'monthly',
        threshold: 80,
      },
    ],
    /*
     * Every one of these is a *record type that already pays* — a chore
     * is a daily, a house job is a project — so the tally routes each
     * record to exactly one area by `belongsTo`. Rule three is that
     * nothing is counted twice, and a Base chore paying both
     * `dailies.completed` and `base.chore-kept` would be the clearest
     * possible breach of it.
     *
     * Points match their counterparts on purpose. Fixing a tap is not
     * worth more or less than a step on any other quest, and pricing it
     * differently would be an opinion about house work smuggled into the
     * currency.
     */
    acts: [
      { id: 'base.action-closed', area: 'base', label: 'Step on a house job', points: 20 },
      { id: 'base.chore-kept', area: 'base', label: 'Kept a chore', points: 15 },
    ],
    /*
     * False, and this is the interesting one.
     *
     * Base shows house upgrades and the tech tree shows the rest, but
     * that is a question of *which screen a row appears on* — an upgrade
     * to a dishwasher and an upgrade to a barbell are the same record with
     * the same gates, money and a prerequisite. The model's claim is that
     * exactly one area spends rather than measures, and splitting a tree
     * across two screens does not make a second spender.
     *
     * `registry.test.ts` → "has exactly one tree" is what holds that, and
     * it caught this the first time it was written the other way.
     */
    hasTree: false,
  },
  {
    area: 'vitals',
    name: 'Vitals',
    phase: 11,
    /*
     * No ladder, and this is the area where one is most tempting.
     *
     * Bodyweight has published standards — BMI, body-fat brackets — and
     * every one of them is a claim about *health* rather than about the
     * thing being measured here. A lifter deliberately at 15% on a bulk
     * is not worse at anything than the same lifter at 10%, and a ladder
     * saying so would be the app inventing a direction its user did not
     * choose. The direction is the phase, and the phase is a decision.
     *
     * The charges are the clearer case: nobody publishes how much coffee
     * a person ought to drink, and a threshold invented here would be
     * exactly the scale this model refuses everywhere.
     */
    ladders: [],
    ratings: [
      {
        id: 'vitals.phase-held',
        source: 'vitals.weeks-in-band',
        name: 'Phase held',
        unit: '% of weeks in the target band',
        direction: 'stay-above',
        cadence: 'monthly',
        threshold: 60,
      },
      {
        id: 'vitals.within-limits',
        source: 'vitals.days-within-limits',
        name: 'Kept inside the limits',
        unit: '% of days',
        direction: 'stay-above',
        cadence: 'monthly',
        threshold: 80,
      },
    ],
    /*
     * **No act pays XP here, and that is the whole point.**
     *
     * XP is paid per act and never per outcome, and every candidate in
     * this area falls on the wrong side of that line. Not drinking is an
     * outcome — it is what happened — so paying for it would be the same
     * mistake as paying a streak. And the only actual *acts* available
     * are spending a charge and stepping on a scale, neither of which is
     * something to reward: paying XP for logging a beer is perverse, and
     * paying it for weighing in turns a measurement into a chore with a
     * score attached, which is how a number stops being honest.
     *
     * So this area measures and never pays. It is the first one that
     * does, and it should stay that way — an area with no acts is not an
     * incomplete area.
     */
    acts: [],
    hasTree: false,
  },
  {
    area: 'places',
    name: 'Places',
    phase: 5,
    /*
     * The weakest anchor in the system, and worth saying so.
     *
     * The *ceiling* is genuinely external — a named region has a boundary
     * and you can walk all of it — but nobody publishes what share of a
     * city counts as "Advanced". The rungs below the top are chosen, which
     * makes this the one ladder whose middle is softer than the strength
     * standards. It is still a ladder rather than a rating because the top
     * is real and reachable; if that ever stops being true, it becomes a
     * rating and loses its levels.
     */
    ladders: [
      {
        id: 'places.coverage',
        source: 'places.explored-share',
        name: 'Exploration',
        unit: 'share of region',
        anchor: 'The named region boundary — 1.0 is all of it, walked',
        thresholds: [0.02, 0.1, 0.25, 0.5, 0.85],
      },
    ],
    ratings: [],
    acts: [
      { id: 'places.place-visited', area: 'places', label: 'Marked a place visited', points: 20 },
    ],
    hasTree: false,
  },
  {
    area: 'jobs',
    name: 'Job search',
    phase: 6,
    /*
     * A campaign has stages and an end, which is not the same as having a
     * ceiling: there is no such thing as being maximally good at looking
     * for work. Nothing here gets a level.
     */
    ladders: [],
    ratings: [
      {
        id: 'jobs.applications',
        source: 'jobs.applications-in-week',
        name: 'Applications sent',
        unit: 'applications',
        direction: 'stay-above',
        cadence: 'weekly',
        threshold: 5,
      },
      {
        id: 'jobs.progression',
        source: 'jobs.stage-advances-in-month',
        name: 'Stage progression',
        unit: 'advances',
        direction: 'increase',
        cadence: 'monthly',
      },
    ],
    acts: [{ id: 'jobs.application-sent', area: 'jobs', label: 'Sent an application', points: 30 }],
    hasTree: false,
  },
]

export const ALL_LADDERS: readonly Ladder[] = SCORING.flatMap((area) => area.ladders)
export const ALL_RATINGS: readonly Rating[] = SCORING.flatMap((area) => area.ratings)
export const ALL_ACTS: readonly ActDefinition[] = SCORING.flatMap((area) => area.acts)
