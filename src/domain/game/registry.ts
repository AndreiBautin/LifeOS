import { BASE, TRAINING, type RecordHome } from '@/domain/base/base'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'

import { STRENGTH_STANDARDS, TOTAL_STANDARDS } from './character'
import type { Ladder } from './ladder'
import type { Rating } from './rating'
import { CREDIT_BANDS } from '@/domain/finance/reading'
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
  'finance',
  'mind',
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
    /*
     * **The house, not its chores.** Reported: *"base should be more
     * about declutter and projects status vs recurring tasks."* It read
     * `Chores kept`, a share of expected days — which is the *dailies*
     * rating with a different name over it, because a chore is a
     * recurring task that happens to be filed here. Base is about the
     * state of the place and the work outstanding on it, and both were
     * already recorded and neither was reported.
     *
     * The chores still pay `base.chore-kept` and still show in the day's
     * list. What changed is what the *month* says about this area.
     */
    ratings: [
      {
        /*
         * A level that moves both ways, which is why the direction is
         * `increase` rather than a threshold. There is no published
         * figure for how cleared a house ought to be — inventing one
         * would be the scale this model refuses — so what is judged is
         * whether it went the right way, the same footing the weight
         * phase used to sit on.
         */
        id: 'base.clear',
        source: 'base.clear',
        name: 'Clear',
        unit: '% clear',
        direction: 'increase',
        cadence: 'monthly',
      },
      {
        /*
         * Steps closed on house jobs, which is the Base half of
         * `projects.throughput` — countable here precisely because that
         * one is own-area only, so a house job's steps land in exactly
         * one of the two.
         *
         * Steps rather than jobs finished, because a house job is rarely
         * finished in the month it was opened and a rating that only
         * moved on completion would read flat through every month of
         * real work.
         */
        id: 'base.jobs',
        source: 'base.job-steps-in-month',
        name: 'House jobs',
        unit: 'steps',
        direction: 'increase',
        cadence: 'monthly',
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
    /*
     * The id stays `vitals` and the name no longer does.
     *
     * An area id is an **address** — it is written into `belongsTo` on
     * every upkeep habit ever filed — so renaming it would orphan those
     * records rather than relabel them. The name is a label, and the
     * screen it named has gone: what is left under this id is the body's
     * upkeep and the body's limits, which is what it is called now.
     */
    area: 'vitals',
    name: 'Upkeep',
    phase: 11,
    /*
     * No ladder. Nobody publishes how much coffee a person ought to
     * drink or how often they ought to floss, and a threshold invented
     * here would be exactly the scale this model refuses everywhere.
     *
     * Bodyweight used to be the tempting case, and the argument against
     * it is kept because it is the general one: BMI and body-fat
     * brackets are published and every one of them is a claim about
     * *health* rather than about the thing measured — a lifter
     * deliberately at 15% on a bulk is not worse at anything than the
     * same lifter at 10%. It is moot now; the weight series is gone, and
     * `vitals.phase-held` went with it because a rating whose source
     * nothing produces reads as absent forever.
     */
    ladders: [],
    ratings: [
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
     * **Back to no acts, and it is the same line drawn twice.**
     *
     * This list was empty, on the reasoning that every candidate fell on
     * the wrong side of the act/outcome line: *not* drinking is an
     * outcome, so paying for it is the streak mistake in a new costume,
     * and the only genuine act was spending a charge, where paying XP
     * for logging a beer is perverse.
     *
     * Brushing your teeth was none of those — a thing you did, an act in
     * exactly the sense a kept daily is one — so `vitals.upkeep-kept`
     * was added and this note said the rule had been applied rather than
     * bent. All of that is still true, and it is now true of
     * `dailies.completed` instead: upkeep is a `group` label rather than
     * a home, so a kept habit pays the same fifteen points under the one
     * name it always deserved. **The act was a second name for one
     * thing, and it went with the home that justified it.**
     *
     * What is left here is the limits, which measure and never pay. An
     * area that measures without paying is not an incomplete area.
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
  {
    area: 'finance',
    name: 'Finance',
    phase: 7,
    /*
     * **Three ladders, and two of them reverse what this note used to
     * say.** It read: a ladder must name an external standard, FICO
     * publishes its bands, and net worth has no such figure — there is
     * no published amount at which somebody has finished having money,
     * so levelling it would invent a scale the app can move.
     *
     * The first half stands. The conclusion did not survive being
     * asked for: _"net worth and savings should be displayed too, look
     * up reasonable standards for a 32 year old."_ **"No finish line"
     * is not "no external standard"** — a powerlifting ladder has no
     * finish line either, and its levels come from where a lifter sits
     * among lifters. The Federal Reserve publishes exactly that for
     * household net worth, and Fidelity publishes a retirement
     * benchmark by age. Neither is a figure this app can move.
     *
     * `domain/finance/standards.ts` holds both tables, why they are two
     * different kinds of standard, and what they cost.
     *
     * **The two ratings that used to be here are gone**, rather than
     * sitting beside the ladders. Rule two forbids one measurement being
     * claimed as both, and the sources differed only in wording.
     */
    ladders: [
      {
        id: 'finance.credit',
        source: 'finance.credit-score',
        name: 'Credit',
        unit: 'FICO',
        anchor: 'The published FICO bands — fair at 580, exceptional at 800',
        thresholds: [...CREDIT_BANDS],
      },
      /*
       * **The thresholds are the published breakpoints themselves**,
       * which is what keeps this honest: the reading is interpolated
       * between four points of a curve, and every place a *level*
       * changes is one of those four points rather than a number chosen
       * here.
       */
      {
        id: 'finance.net-worth',
        source: 'finance.net-worth-percentile',
        name: 'Net worth',
        unit: 'percentile for your age',
        anchor:
          'The 2022 Federal Reserve Survey of Consumer Finances — households your age, quarter by quarter',
        thresholds: [0, 25, 50, 75, 90],
      },
      /*
       * One is exactly on track, so **Advanced is the benchmark met**
       * rather than beaten. The rungs below it are the app's banding of
       * a published target and are named as such on the screen; the
       * target itself is Fidelity's.
       */
      {
        id: 'finance.retirement',
        source: 'finance.retirement-share',
        name: 'Retirement',
        unit: '× the benchmark for your age',
        anchor: "Fidelity's savings benchmark — 1× salary by 30, 3× by 40, 10× by 67",
        thresholds: [0, 0.25, 0.5, 1, 1.5],
      },
    ],
    ratings: [],
    /*
     * **No acts, deliberately, and this area is the clearest case for
     * it.** XP is paid for things you did. Typing your net worth in is a
     * *measurement* — the app already refuses to pay for standing on a
     * scale for exactly this reason — and paying for the number going up
     * would be paying for an outcome, which is the line the job search
     * draws and the streak mistake in its oldest costume.
     *
     * An area that measures without paying is not an incomplete area.
     * Vitals ran that way for most of its life.
     */
    acts: [],
    hasTree: false,
  },
  {
    area: 'mind',
    name: 'Mind',
    phase: 8,
    /*
     * **No ladder, and this is the one where a count is most tempting.**
     * LeetCode publishes how many problems exist and every practice site
     * shows a total solved, so a "1,200 problems" ceiling looks like an
     * external standard. It is not one: it is a count of that site's
     * catalogue, which grows, and nothing about having solved half of it
     * says you are halfway to anything. A ladder must name a standard
     * somebody outside the app anchored — bodyweight multiples, FICO
     * bands — and there is no published table of what makes a practised
     * engineer.
     */
    ladders: [],
    ratings: [
      {
        id: 'mind.throughput',
        source: 'mind.problems-solved-in-month',
        name: 'Problems solved',
        unit: 'problems',
        direction: 'increase',
        cadence: 'monthly',
      },
      {
        /*
         * Days practised, not problems solved, and the pair is the
         * point: six problems in one Sunday and six spread over six days
         * are very different months, and one number cannot say which
         * happened.
         */
        id: 'mind.consistency',
        source: 'mind.days-practised-in-month',
        name: 'Days practised',
        unit: 'days',
        direction: 'increase',
        cadence: 'monthly',
      },
    ],
    acts: [
      { id: 'mind.problem-solved', area: 'mind', label: 'Solved a problem', points: 20 },
      /*
       * The same fifteen points every kept habit is worth, under a fifth
       * name. `tallyActs` splits by `belongsTo`, so a study habit filed
       * here pays this and never `dailies.completed`.
       */
      { id: 'mind.habit-kept', area: 'mind', label: 'Studied', points: 15 },
    ],
    hasTree: false,
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
/**
 * Which act keeping a daily performs, from where the daily is filed.
 *
 * **Derived from the record, not from the screen.** It used to be the
 * caller's answer, on the reasoning that the screen doing the calling
 * *was* the area — true while Today showed only its own habits, Base
 * only chores and Vitals only upkeep. The moment Today began reporting
 * everything due, the screen stopped being the area and a chore ticked
 * there announced "Kept a daily".
 *
 * The XP was never wrong — `tallyActs` splits by `belongsTo` and always
 * did — but the badge is supposed to say what the registry says, and it
 * was saying something else. Reading the same field both places is what
 * makes them agree by construction.
 */
export function dailyActFor(home: RecordHome | undefined): string {
  if (home === BASE) return 'base.chore-kept'
  if (home === TRAINING) return 'training.habit-kept'
  return 'dailies.completed'
}

export function actById(id: string): ActDefinition | undefined {
  return ALL_ACTS.find((act) => act.id === id)
}
