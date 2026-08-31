import { BASE, JOBS, keepFor } from '@/domain/base/base'
import {
  markReached,
  standingFor,
  undoReached,
  type Campaign,
  type CampaignStanding,
  type Evidence,
  type Stage,
} from '@/domain/campaign/campaign'
import { latest } from '@/domain/finance/reading'
import type { CampaignId, IdGenerator, StageId } from '@/domain/ids/ids'
import type {
  CampaignRepository,
  Clock,
  FinanceRepository,
  ProjectRepository,
} from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'

/**
 * The long arc, read against the areas that already record its parts.
 *
 * **Nothing here is stored twice.** The evidence is gathered live from
 * Base, Jobs and Finance every time the arc is read — a copied count
 * would be a total that can be wrong, which this app already knows the
 * cost of. The campaign record holds only what nothing else does: the
 * stages somebody named, and the dates they declared.
 */

export interface CampaignDeps {
  readonly campaigns: CampaignRepository
  readonly projects: ProjectRepository
  readonly finance: FinanceRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

/**
 * What the app can witness, read from where it already lives.
 *
 * **House jobs and offers are counted from projects, filtered by home.**
 * `keepFor` is what stops a quest counting as house work — the same leak
 * `recommendation` had, one layer up, found by driving the app rather
 * than by a test.
 *
 * **The money is read live rather than for a month**, which is the
 * ladder/rating split made concrete: a threshold does not care whether
 * this month's review was opened, so it takes the most recent figure
 * whenever that was. `latest` works per *field*, so somebody who checks
 * their score quarterly still gets a net worth from last month.
 */
export async function gatherEvidence(deps: CampaignDeps): Promise<Evidence> {
  const [projects, finance] = await Promise.all([deps.projects.all(), deps.finance.all()])

  const houseJobsDone = keepFor(projects, BASE).filter(
    (project) =>
      project.actions.length > 0 && project.actions.every((one) => one.status === 'done'),
  ).length

  /*
   * An application that has been through every stage — the last of which
   * is Offer. Counted the same way a finished house job is, because both
   * questions are "did this reach the end", and an application's stages
   * are `ActionItem`s exactly so their dates are countable.
   */
  const offers = keepFor(projects, JOBS).filter(
    (project) =>
      project.actions.length > 0 && project.actions.every((one) => one.status === 'done'),
  ).length

  /*
   * Per field, not per row. Somebody who checks their credit score
   * quarterly has months holding a net worth and no score, and taking
   * the newest *row* would report the score as missing for two months
   * out of three.
   */
  const netWorthMinor = latest(finance, 'netWorthMinor')
  const retirementMinor = latest(finance, 'retirementMinor')
  const creditScore = latest(finance, 'creditScore')

  return {
    houseJobsDone,
    offers,
    ...(netWorthMinor === undefined ? {} : { netWorthMinor }),
    ...(retirementMinor === undefined ? {} : { retirementMinor }),
    ...(creditScore === undefined ? {} : { creditScore }),
  }
}

export async function campaignStandings(deps: CampaignDeps): Promise<readonly CampaignStanding[]> {
  const [campaigns, evidence] = await Promise.all([deps.campaigns.all(), gatherEvidence(deps)])

  return campaigns
    .map((campaign) => standingFor(campaign, evidence))
    .sort((a, b) => a.campaign.createdAt.localeCompare(b.campaign.createdAt))
}

export interface NewCampaign {
  readonly name: string
  readonly aim?: string
  readonly stages: readonly Omit<Stage, 'id' | 'reached'>[]
}

/**
 * Creates an arc with its stages, in one write.
 *
 * The stages arrive with it rather than through a second call, for the
 * reason a house job's steps do: three sequential writes is three
 * chances to leave a half-built record behind.
 */
export async function addCampaign(
  input: NewCampaign,
  deps: CampaignDeps,
): Promise<{ readonly error?: string }> {
  const name = input.name.trim()
  if (name === '') return { error: 'An arc needs a name.' }

  const aim = input.aim?.trim() ?? ''

  await deps.campaigns.save({
    id: deps.ids.next() as CampaignId,
    name,
    ...(aim === '' ? {} : { aim }),
    stages: input.stages.map((stage) => ({
      ...stage,
      id: deps.ids.next() as StageId,
      reached: [],
    })),
    createdAt: deps.clock.now().toISOString(),
  })

  return {}
}

/** Records a lap of a declared stage. */
export async function reachStage(
  id: CampaignId,
  stageId: StageId,
  note: string | undefined,
  deps: CampaignDeps,
): Promise<void> {
  await editStage(id, stageId, deps, (stage) =>
    markReached(stage, toDayKey(deps.clock.now()), note),
  )
}

/** Takes back the most recent lap, and only that one. */
export async function undoStage(
  id: CampaignId,
  stageId: StageId,
  deps: CampaignDeps,
): Promise<void> {
  await editStage(id, stageId, deps, undoReached)
}

export async function removeCampaign(id: CampaignId, deps: CampaignDeps): Promise<void> {
  await deps.campaigns.remove(id)
}

/**
 * The one path a stage change takes to storage.
 *
 * A campaign is saved whole, so every edit is a read-modify-write of the
 * same record — and two of those in flight at once would count one tap.
 * Routing both through here means the mapping over stages is written
 * once rather than in each caller.
 */
async function editStage(
  id: CampaignId,
  stageId: StageId,
  deps: CampaignDeps,
  change: (stage: Stage) => Stage,
): Promise<void> {
  const campaign = await deps.campaigns.byId(id)
  if (campaign === undefined) return

  const next: Campaign = {
    ...campaign,
    stages: campaign.stages.map((stage) => (stage.id === stageId ? change(stage) : stage)),
  }

  await deps.campaigns.save(next)
}
