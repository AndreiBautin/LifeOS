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
  /** Houses actually seen — viewed, offered on, or ruled out. */
  | { readonly kind: 'homes-viewed'; readonly count: number }
  /** Net worth, in minor units, from the monthly finance reading. */
  | { readonly kind: 'net-worth'; readonly minorUnits: number }
  /** Retirement savings, in minor units. */
  | { readonly kind: 'retirement'; readonly minorUnits: number }
  | { readonly kind: 'credit-score'; readonly score: number }

export const REQUIREMENT_KINDS = [
  'declared',
  'house-jobs',
  'offers',
  'homes-viewed',
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
  /** Houses seen -- viewed, offered on, or ruled out. */
  readonly homesViewed?: number
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
  /**
   * How many stages are met, **anywhere in the list**.
   *
   * A count, not a position. The arc is ordered but not gated — a later
   * stage can be met first — so this is not "how far along the chain you
   * are" and must never be used as one. See `nextPosition`.
   */
  readonly done: number
  readonly total: number
  /** The first stage not yet met — what the arc is currently waiting on. */
  readonly next?: StageStanding
  /**
   * Where `next` sits in the list, counting from one.
   *
   * **Carried rather than derived at the call site, because a screen
   * computed it as `done + 1` and got it wrong.** Reported: *"why is
   * this showing as stage 2 if we're only on stage one, fix up the
   * house?"* — the card named *Fix up the house*, which is stage one,
   * and then called it stage two on the line below.
   *
   * `done + 1` is only the position of `next` when the met stages are a
   * **prefix** of the list, and this arc explicitly allows them not to
   * be: tick a declared stage further down and the count moves while the
   * first outstanding stage does not. Computing this beside `next`, from
   * the same search, is what stops the two disagreeing.
   *
   * Absent exactly when `next` is.
   */
  readonly nextPosition?: number
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
    case 'homes-viewed':
      return evidence.homesViewed ?? 0
    case 'net-worth':
      return evidence.netWorthMinor
    case 'retirement':
      return evidence.retirementMinor
    case 'credit-score':
      return evidence.creditScore
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
  const target = targetOf(stage.requirement)

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

  // One search, so `next` and its position cannot come apart.
  const at = stages.findIndex((one) => !one.met)
  const next = at === -1 ? undefined : stages[at]

  return {
    campaign,
    stages,
    done: stages.filter((one) => one.met).length,
    total: stages.length,
    ...(next === undefined ? {} : { next, nextPosition: at + 1 }),
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

/**
 * What each kind of requirement is called, and what its number means.
 *
 * Beside the type rather than in the component, because the *unit* is a
 * property of the requirement: a count of house jobs, a sum of money, a
 * FICO score. A screen that had to remember which was which would get it
 * wrong the first time a kind was added.
 */
export const REQUIREMENT_LABELS: Record<Requirement['kind'], string> = {
  declared: 'When you say so',
  'house-jobs': 'House jobs finished',
  offers: 'Applications through every stage',
  'homes-viewed': 'Houses seen',
  'net-worth': 'Net worth reaches',
  retirement: 'Retirement reaches',
  'credit-score': 'Credit score reaches',
}

/** Whether a kind's target is money, so a screen knows to convert. */
export function isMoney(kind: Requirement['kind']): boolean {
  return kind === 'net-worth' || kind === 'retirement'
}

/** The target a requirement carries, for an editor to open on. */
export function targetOf(requirement: Requirement): number | undefined {
  switch (requirement.kind) {
    case 'declared':
      return undefined
    case 'house-jobs':
    case 'offers':
    case 'homes-viewed':
      return requirement.count
    case 'net-worth':
    case 'retirement':
      return requirement.minorUnits
    case 'credit-score':
      return requirement.score
  }
}

/**
 * Builds a requirement of a kind from one number.
 *
 * One constructor rather than six at the call site, so the union's shape
 * is known in exactly one place — and a kind added to the type fails the
 * switch here rather than silently producing the wrong field name
 * somewhere in a form.
 */
export function requirementOf(kind: Requirement['kind'], target: number): Requirement {
  const value = Math.max(0, Math.round(target))

  switch (kind) {
    case 'declared':
      return { kind: 'declared' }
    case 'house-jobs':
      return { kind: 'house-jobs', count: Math.max(1, value) }
    case 'offers':
      return { kind: 'offers', count: Math.max(1, value) }
    case 'homes-viewed':
      return { kind: 'homes-viewed', count: Math.max(1, value) }
    case 'net-worth':
      return { kind: 'net-worth', minorUnits: value }
    case 'retirement':
      return { kind: 'retirement', minorUnits: value }
    case 'credit-score':
      return { kind: 'credit-score', score: value }
  }
}

/**
 * Renames a stage, and changes nothing else about it.
 *
 * A label, in the sense `relabelDaily` uses: the stage means exactly
 * what it meant before, and every lap recorded against it is still a lap
 * that happened. Safe in a way changing the requirement is not.
 */
export function renameStage(campaign: Campaign, stageId: StageId, name: string): Campaign {
  const trimmed = name.trim()
  if (trimmed === '') return campaign

  return mapStage(campaign, stageId, (stage) => ({ ...stage, name: trimmed }))
}

/**
 * Changes what a stage needs.
 *
 * **The laps are kept, deliberately, even when they stop deciding
 * anything.** Turning a declared stage into a measured one leaves its
 * recorded dates inert — the reading decides now — and the tempting move
 * is to clear them. That would be a destructive edit wearing a
 * settings-change's clothes: "2026-08-31 · Maple Street" is a true
 * record of a day something happened, and it survives the same way a
 * retired habit's kept days do.
 *
 * Nothing historical is *reinterpreted* by this, which is what makes it
 * different from editing a habit's cadence. A cadence decides which days
 * were expected and re-reads every streak; a target is compared against
 * a reading taken now.
 */
export function retargetStage(
  campaign: Campaign,
  stageId: StageId,
  requirement: Requirement,
): Campaign {
  return mapStage(campaign, stageId, (stage) => ({ ...stage, requirement }))
}

/** Adds a stage at the end. */
export function addStage(campaign: Campaign, stage: Stage): Campaign {
  return { ...campaign, stages: [...campaign.stages, stage] }
}

/**
 * Removes a stage and everything recorded against it.
 *
 * **Named as the destructive thing it is**, and separate from every
 * other edit here — the rule that a call site must not be able to ask
 * for "change this" and receive "wipe it". A stage reached three times
 * carries three dated records that nothing else holds, and `laps` exists
 * so a screen can say how many are about to go.
 */
export function removeStage(campaign: Campaign, stageId: StageId): Campaign {
  return { ...campaign, stages: campaign.stages.filter((stage) => stage.id !== stageId) }
}

/** How many recorded laps a removal would discard. */
export function laps(campaign: Campaign, stageId: StageId): number {
  return campaign.stages.find((stage) => stage.id === stageId)?.reached.length ?? 0
}

/**
 * Moves a stage one place, which is a change to the shape of the arc.
 *
 * The order decides which stage reads as "Now", so this is not
 * cosmetic — but it rewrites nothing, and a stage at the wrong point in
 * the chain is the commonest thing to get wrong when writing one out.
 * Out-of-range moves return the campaign unchanged rather than wrapping
 * round, because a stage jumping from the end to the top is never what a
 * press of "up" meant.
 */
export function moveStage(campaign: Campaign, stageId: StageId, by: -1 | 1): Campaign {
  const from = campaign.stages.findIndex((stage) => stage.id === stageId)
  if (from === -1) return campaign

  const to = from + by
  if (to < 0 || to >= campaign.stages.length) return campaign

  const stages = [...campaign.stages]
  const [moved] = stages.splice(from, 1)
  if (moved === undefined) return campaign
  stages.splice(to, 0, moved)

  return { ...campaign, stages }
}

/** Renames the arc, and its aim. Both are labels. */
export function renameCampaign(campaign: Campaign, name: string, aim: string): Campaign {
  const trimmedName = name.trim()
  if (trimmedName === '') return campaign

  const trimmedAim = aim.trim()

  // Dropped from the spread rather than set to undefined: a key holding
  // undefined is a key, and it would travel over sync as one.
  const { aim: _cleared, ...rest } = campaign

  return { ...rest, name: trimmedName, ...(trimmedAim === '' ? {} : { aim: trimmedAim }) }
}

function mapStage(campaign: Campaign, stageId: StageId, change: (stage: Stage) => Stage): Campaign {
  return {
    ...campaign,
    stages: campaign.stages.map((stage) => (stage.id === stageId ? change(stage) : stage)),
  }
}

/**
 * A stage's name and requirement together, because they are one edit.
 *
 * **Not two calls, and that was a real bug.** The editor first fired a
 * rename and a retarget as separate mutations, on the reasoning that
 * they are separate operations. They are — but both are a
 * read-modify-write of the same campaign record, so the second read the
 * copy from *before* the first had saved and wrote the old name back.
 * Driving it caught this: the target moved to 30,000 and the new name
 * silently did not stick.
 *
 * This is the same hazard `serialise` exists for in the backlog hooks,
 * arriving from the other direction. There the answer is a queue,
 * because two taps really are two events. Here one form press is one
 * edit, so the answer is one write.
 */
export function reshapeStage(
  campaign: Campaign,
  stageId: StageId,
  name: string,
  requirement: Requirement,
): Campaign {
  const trimmed = name.trim()
  if (trimmed === '') return campaign

  return mapStage(campaign, stageId, (stage) => ({ ...stage, name: trimmed, requirement }))
}
