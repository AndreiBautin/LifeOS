import type { CampaignId, StageId } from '@/domain/ids/ids'

/**
 * A long arc across several areas — the thing a "main quest" actually
 * is when it is stated honestly.
 *
 * The report it was built from: *"I want to move eventually, but that's
 * dependent on fixing up the house, improving income, finding a new
 * house, saving for a down payment, selling the house, implementing the
 * move."* Every input to that already exists in the hub — Base holds the
 * house work, Jobs holds the applications, Finance holds the money — and
 * **nothing represented the arc itself.** That gap is what this fills.
 *
 * **It pays no XP, and could not honestly pay any.** Every stage is met
 * by work that already paid in its own area: closing a house job pays
 * `base.action-closed`, sending an application pays
 * `jobs.application-sent`. Paying again here would be the same effort
 * counted twice, which is rule three. So this is a *readout* that spans
 * areas — the first screen in the app that does — and Finance already
 * demonstrates that an area which reports and never pays is not an
 * incomplete one.
 *
 * **It is not a `Project`, and the reason is that rule.** A project is
 * the app's existing shape for "a thing with steps", and reusing it here
 * would be the obvious move — but closing a project's action pays
 * `projects.main-action-closed`, so a campaign stage closing would pay
 * XP for work its own area had already paid for. The record types are
 * separate because the scoring has to be.
 *
 * **It is not a second tech tree either.** The tree is gated progression
 * with prerequisites, which is the right *shape*, and
 * `registry.test.ts` holds that exactly one area spends rather than
 * measures. A campaign buys nothing.
 */

/**
 * What a stage needs, and whether the app can witness it.
 *
 * The split is the honest part. Some of this arc is measurable from
 * records already kept — the house jobs are counted, the money is read
 * off a monthly statement — and some of it genuinely is not: nothing in
 * a habit tracker knows that you found a house you liked. A stage says
 * which kind it is rather than pretending everything is measurable, and
 * a declared stage is not a lesser one.
 */
export type Requirement =
  /** You say when. The app records the date and takes your word. */
  | { readonly kind: 'declared' }
  /** House projects finished, from Base. */
  | { readonly kind: 'house-jobs'; readonly count: number }
  /** Applications that reached the Offer stage, from Jobs. */
  | { readonly kind: 'offers'; readonly count: number }
  /** Net worth, in minor units, from the monthly finance reading. */
  | { readonly kind: 'net-worth'; readonly minorUnits: number }
  /** Retirement savings, in minor units. */
  | { readonly kind: 'retirement'; readonly minorUnits: number }
  | { readonly kind: 'credit-score'; readonly score: number }

export const REQUIREMENT_KINDS = [
  'declared',
  'house-jobs',
  'offers',
  'net-worth',
  'retirement',
  'credit-score',
] as const

/**
 * One time a stage was reached.
 *
 * A list rather than a flag, because **the arc is not one-shot.** The
 * observation that produced this: *"job improvement is interesting
 * because I can progress through multiple jobs, and I guess that applies
 * to houses too."* A stage you can run again keeps every lap, with a
 * note saying which one it was — so "improved my income" reads as three
 * dated entries rather than a tick that stopped meaning anything after
 * the first.
 */
export interface Reached {
  /** A local day key. */
  readonly at: string
  /** Which job, which house. Free text, because it is a label. */
  readonly note?: string
}

export interface Stage {
  readonly id: StageId
  readonly name: string
  readonly requirement: Requirement
  readonly reached: readonly Reached[]
  /**
   * Whether running it again is meaningful.
   *
   * Only ever true of a declared stage: a measured one is a threshold,
   * and a threshold you have crossed is crossed. Changing jobs three
   * times is three laps; having £40,000 twice is not a thing.
   */
  readonly repeatable?: boolean
}

export interface Campaign {
  readonly id: CampaignId
  readonly name: string
  /** The destination, in a sentence. Shown above the stages. */
  readonly aim?: string
  readonly stages: readonly Stage[]
  readonly createdAt: string
  /** Written by the repository, never here. */
  readonly updatedAt?: string
}

/**
 * What the app knows, gathered from the areas that already record it.
 *
 * Every field optional, and **absent is not zero** — the rule the whole
 * app follows. No finance reading means a net-worth stage is *unproven*
 * rather than 0% of the way there, because a bar at nought against a
 * target somebody set reads as failing when nothing has been measured.
 */
export interface Evidence {
  readonly houseJobsDone?: number
  readonly offers?: number
  readonly netWorthMinor?: number
  readonly retirementMinor?: number
  readonly creditScore?: number
}

export interface StageStanding {
  readonly stage: Stage
  readonly met: boolean
  /** How far along, when the requirement is a measurable quantity. */
  readonly progress?: { readonly value: number; readonly of: number }
  /**
   * Absent when nothing has been recorded to judge it by.
   *
   * Distinct from `met: false`, which is a real answer. A net-worth
   * stage on a database with no finance readings has not been failed.
   */
  readonly unproven: boolean
}

export interface CampaignStanding {
  readonly campaign: Campaign
  readonly stages: readonly StageStanding[]
  readonly done: number
  readonly total: number
  /** The first stage not yet met — what the arc is currently waiting on. */
  readonly next?: StageStanding
}

/**
 * Whether a measured requirement has a reading to judge it against.
 *
 * A count from Base or Jobs is always available and is genuinely zero
 * when nothing has happened — you can count no finished house jobs. A
 * *money* figure is different: it is typed in monthly, and its absence
 * means nobody has said, not that it is nothing.
 */
function readingFor(requirement: Requirement, evidence: Evidence): number | undefined {
  switch (requirement.kind) {
    case 'declared':
      return undefined
    case 'house-jobs':
      return evidence.houseJobsDone ?? 0
    case 'offers':
      return evidence.offers ?? 0
    case 'net-worth':
      return evidence.netWorthMinor
    case 'retirement':
      return evidence.retirementMinor
    case 'credit-score':
      return evidence.creditScore
  }
}

function targetFor(requirement: Requirement): number | undefined {
  switch (requirement.kind) {
    case 'declared':
      return undefined
    case 'house-jobs':
      return requirement.count
    case 'offers':
      return requirement.count
    case 'net-worth':
      return requirement.minorUnits
    case 'retirement':
      return requirement.minorUnits
    case 'credit-score':
      return requirement.score
  }
}

function standingForStage(stage: Stage, evidence: Evidence): StageStanding {
  /*
   * A declared stage is met by having been declared, and nothing else.
   * The app takes your word and records the date; there is no reading to
   * disagree with.
   */
  if (stage.requirement.kind === 'declared') {
    return { stage, met: stage.reached.length > 0, unproven: false }
  }

  const reading = readingFor(stage.requirement, evidence)
  const target = targetFor(stage.requirement)

  if (reading === undefined || target === undefined) {
    return { stage, met: false, unproven: true }
  }

  return {
    stage,
    met: reading >= target,
    progress: { value: reading, of: target },
    unproven: false,
  }
}

/**
 * The arc, read against what the app knows.
 *
 * **Stages are ordered but not gated.** The chain really is a chain —
 * you cannot put a deposit down before you have one — but a screen that
 * *refused* to record a later stage would be the app policing somebody's
 * life rather than reporting on it, and the order things happen in is
 * not always the order they were written. So a later stage can be met
 * first, and `next` names the earliest one outstanding, which is what
 * "where is this up to" actually means.
 *
 * `done` counts met stages and `total` counts all of them, so the
 * denominator is stages **the person named** rather than a scale this
 * app invented — the same reason the season bar measures against your
 * own previous season.
 */
export function standingFor(campaign: Campaign, evidence: Evidence): CampaignStanding {
  const stages = campaign.stages.map((stage) => standingForStage(stage, evidence))
  const next = stages.find((one) => !one.met)

  return {
    campaign,
    stages,
    done: stages.filter((one) => one.met).length,
    total: stages.length,
    ...(next === undefined ? {} : { next }),
  }
}

/** Records a lap, keeping the ones before it. */
export function markReached(stage: Stage, at: string, note?: string): Stage {
  const trimmed = note?.trim() ?? ''

  return {
    ...stage,
    reached: [...stage.reached, { at, ...(trimmed === '' ? {} : { note: trimmed }) }],
  }
}

/**
 * Undoes the most recent lap, and only that one.
 *
 * A mis-tap on a stage you reached three times should cost the third,
 * not the record of the first two — which is what clearing the list
 * would do, and it is the sort of thing that is only noticed afterwards.
 */
export function undoReached(stage: Stage): Stage {
  return { ...stage, reached: stage.reached.slice(0, -1) }
}
