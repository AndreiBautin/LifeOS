import type { Daily } from '@/domain/dailies/daily'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'

/**
 * Base is the place you live, treated as an area of its own.
 *
 * It holds three kinds of thing and invents none of them. A leaking tap
 * is a project with steps; a weekly hoover is a daily on a cadence; a new
 * dishwasher is an upgrade with a price. Those are the shapes the app
 * already has, and a second implementation of "a thing with steps" would
 * be two places for a bug about steps to live.
 *
 * **What Base actually changes is where they appear.** House work has a
 * different rhythm from the rest of a quest log — it arrives when
 * something breaks, it is mostly the same errand each time (find the
 * right person, get them to come), and it never finishes. Mixed into the
 * quest list it crowds out the things a person chose to do; on its own
 * screen it reads as maintenance, which is what it is.
 *
 * So membership is one optional field on each record rather than a new
 * store. Absent means the record belongs where it always did, which is
 * the right answer for every row written before Base existed.
 */
export const BASE = 'base'

/**
 * The body, as a place records are filed — brushing, flossing, washing
 * your hair.
 *
 * The second answer the union below was written to expect. These are
 * dailies in every respect that matters: a cadence, a streak, and now a
 * count for the ones done twice a day. What they are not is *quests*, and
 * on Today they crowd out the things somebody actually chose — the same
 * argument that moved house work to Base, applied to the other set of
 * chores nobody thinks of as chores.
 *
 * Filed under `vitals` because that is the area that scores them, and
 * `tallyActs` splits by area. The screen calls the section Upkeep, which
 * is what a person calls it; the code uses the area id, the way Quests
 * sits over `Project`.
 */
export const UPKEEP = 'vitals'

/**
 * Training, as a place records are filed — pre-workout carbs, protein
 * after.
 *
 * The third answer, and the one that shows what the union is for. These
 * are habits in every respect: a cadence, a streak, a tick. What makes
 * them not *dailies* is that they only mean anything on a day you lift,
 * so on Today they are noise five days out of seven and on the Train
 * screen they are the obvious thing.
 *
 * **The cadence is still weekdays, and that is a real limitation rather
 * than a shortcut.** The app has no training calendar to hang them on:
 * it stores `daysPerWeek` — a count — and a *position* in a sequence
 * that moves only when a session is finished or skipped. Nothing
 * anywhere can answer "was the 25th a training day", which is precisely
 * the question every `Cadence` kind must answer from the date alone for
 * a streak to be walkable. So the lifter names the days they lift, and
 * the app files the habit under Training rather than pretending to know.
 */
export const TRAINING = 'training'

/**
 * The job search, as a place records are filed.
 *
 * An application is a project with a fixed set of stages — see
 * `domain/jobs/application.ts` — so what it needs from this module is
 * only a home, the same as a house job. Filed under `jobs` because that
 * is the area `registry.ts` declared for it in phase 0 and the area
 * `tallyActs` pays.
 *
 * **This module has outgrown its name.** It is called `base` and now
 * answers "which area owns this record" for five of them. Renaming it
 * would be churn across every import for no behaviour, so it stays, and
 * this paragraph is the warning that `base.ts` is really `homes.ts`.
 */
export const JOBS = 'jobs'

/**
 * Practice, as a place records are filed -- a daily study of design
 * patterns, a language drill.
 *
 * The fifth answer, and it earns a home rather than a group because it
 * wants **both** halves of what a home is: a screen of its own, and an
 * area that pays its own XP. A group is a label and would have given the
 * first without the second, which is precisely the distinction that sent
 * supplements and pet care to `Daily.group` instead.
 */
export const MIND = 'mind'

/**
 * The errand a house job almost always is.
 *
 * This module's opening paragraph has said for as long as it has existed
 * that house work "is mostly the same errand each time — find the right
 * person, get them to come", and the Base screen's empty state told the
 * reader the same three steps. Neither of them did anything with it: a
 * new job arrived with no steps and the shape had to be typed out again
 * every time, from memory, off a sentence on a screen you were no longer
 * looking at.
 *
 * Offered rather than applied. The add form ticks all three and lets any
 * of them be turned off, because a boiler service booked by a landlord
 * skips the first two — the same stance `ApplyEstimates` takes, and for
 * the same reason: a default that cannot be declined is a decision taken
 * away.
 *
 * This is the *hiring* errand. See {@link DIY_JOB_STEPS} for the one
 * that has nobody to find.
 */
export const HIRED_JOB_STEPS = [
  'Find the right person',
  'Get a quote',
  'Book the appointment',
] as const

/**
 * The other errand: *"there are also some base projects that I will
 * handle myself rather than hiring someone."*
 *
 * The steps above are the *hiring* errand, and every job opened with
 * them. On a job you do yourself all three are wrong — there is nobody
 * to find, nothing to quote and no appointment — so the shape had to be
 * unticked three times and typed out by hand, which is precisely the
 * gap the template was added to close, reappearing for half the jobs.
 *
 * **Two templates rather than one with a flag.** The parallel is exact:
 * work out what it needs, get what it takes, do it. Naming both is what
 * makes the choice visible at the moment it is made, where a boolean on
 * one list would leave a form asking to un-tick its way to the other
 * shape.
 */
export const DIY_JOB_STEPS = ['Work out what it needs', 'Get the materials', 'Do the work'] as const

/**
 * How a job gets done, offered at the moment one is created.
 *
 * **Deliberately not stored on the record.** A project already carries
 * its steps, and "Find the right person" against "Work out what it
 * needs" says which errand this is more plainly than a field would. A
 * stored approach would be a second answer to a question the actions
 * already answer, and this app has paid for that shape before — the
 * rule here is that a field needs something that reads it, and nothing
 * would.
 *
 * It does not change what a job pays, either. Both openings are three
 * steps at `base.action-closed`, and scaling XP by how hard the work
 * was is the outcome creeping back in: doing it yourself is a decision
 * about the afternoon, not a harder version of the same act. Difficulty
 * is recorded and does not scale the points anywhere else here.
 */
export const JOB_APPROACHES = [
  { id: 'hired', label: 'Hire someone', steps: HIRED_JOB_STEPS },
  { id: 'diy', label: 'Do it myself', steps: DIY_JOB_STEPS },
] as const

export type JobApproach = (typeof JOB_APPROACHES)[number]['id']

export function stepsFor(approach: JobApproach): readonly string[] {
  return (JOB_APPROACHES.find((one) => one.id === approach) ?? JOB_APPROACHES[0]).steps
}

/**
 * Where a record lives when it is not in its natural home.
 *
 * Written as a union rather than a boolean because the question is
 * *which* area owns this, not whether some flag is set — and that has now
 * paid for itself: adding the body as a second answer is one more member
 * here, where an `isBase` flag would have had to be replaced everywhere
 * it was read.
 */
export const RECORD_HOMES = [BASE, UPKEEP, TRAINING, JOBS, MIND] as const

export type RecordHome = (typeof RECORD_HOMES)[number]

/** Anything that can be filed to an area other than its own. */
export interface Homed {
  readonly belongsTo?: RecordHome
}

export function isBase(record: Homed): boolean {
  return record.belongsTo === BASE
}

export function isUpkeep(record: Homed): boolean {
  return record.belongsTo === UPKEEP
}

export function isTraining(record: Homed): boolean {
  return record.belongsTo === TRAINING
}

export function isJobs(record: Homed): boolean {
  return record.belongsTo === JOBS
}

export function isMind(record: Homed): boolean {
  return record.belongsTo === MIND
}

/**
 * The complement, and it has to be written down rather than inferred.
 *
 * Every screen that listed one of these types now has to choose a side,
 * and the failure mode is silent in one direction only: forget to exclude
 * Base from the Quests page and a house project shows up in both places,
 * where it reads as a duplicate rather than as a bug. Naming both halves
 * makes the choice explicit at each call site.
 */
export function isOwnArea(record: Homed): boolean {
  return record.belongsTo === undefined
}

/**
 * Which side of the Base split a list wants.
 *
 * Required rather than defaulted, at every list that can return both. A
 * default would be an opinion the call site did not state, and the
 * failure it hides is silent in one direction only: a screen that forgets
 * to exclude Base shows a house job in the quest log *and* on the Base
 * page, where it reads as a duplicate rather than as a bug.
 */
export type HomeFilter = 'own-area' | RecordHome | 'both'

/**
 * Keeps the side the caller asked for.
 *
 * Written against `belongsTo` directly rather than as a chain of
 * predicates, so a third home is a value and not another branch. The
 * homes are the members of `RecordHome`, which is what makes the filter
 * total by construction: a new area cannot be added without this
 * accepting it.
 */
export function keepFor<T extends Homed>(records: readonly T[], home: HomeFilter): readonly T[] {
  if (home === 'both') return records
  if (home === 'own-area') return records.filter(isOwnArea)
  return records.filter((record) => record.belongsTo === home)
}

export interface BaseContents {
  /** House projects — the thing that broke and who is coming to fix it. */
  readonly projects: readonly Project[]
  /** Chores, on whatever cadence. */
  readonly chores: readonly Daily[]
  /** Upgrades to the place rather than to the person. */
  readonly upgrades: readonly Upgrade[]
}

export function baseContents(
  projects: readonly Project[],
  dailies: readonly Daily[],
  upgrades: readonly Upgrade[],
): BaseContents {
  return {
    projects: projects.filter(isBase),
    chores: dailies.filter(isBase),
    upgrades: upgrades.filter(isBase),
  }
}
