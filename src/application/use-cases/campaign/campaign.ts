import {
  addStage,
  markReached,
  moveStage,
  removeStage,
  renameCampaign,
  renameStage,
  reshapeStage,
  retargetStage,
  type Requirement,
  standingFor,
  undoReached,
  type Campaign,
  type CampaignStanding,
  type Evidence,
  type Stage,
} from '@/domain/campaign/campaign'
import { latest } from '@/domain/finance/reading'
import type { CampaignId, IdGenerator, StageId } from '@/domain/ids/ids'
import type { CampaignRepository, Clock, FinanceRepository } from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'

/**
 * The long arc, read against the areas that already record its parts.
 *
 * **Nothing here is stored twice.** The evidence is gathered live from
 * Finance every time the arc is read — a copied count
 * would be a total that can be wrong, which this app already knows the
 * cost of. The campaign record holds only what nothing else does: the
 * stages somebody named, and the dates they declared.
 */

export interface CampaignDeps {
  readonly campaigns: CampaignRepository
  readonly finance: FinanceRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

/**
 * What the app can witness, read from where it already lives.
 *
 * **Only the money figures now.** House jobs, job applications and the
 * quests a stage could link to all left the app — projects are worked
 * through in Notion — so a stage is either declared, a box you tick, or
 * reads a figure from the monthly finance reading. `latest` works per
 * *field*, so somebody who checks their score quarterly still gets last
 * month's net worth.
 */
export async function gatherEvidence(deps: CampaignDeps): Promise<Evidence> {
  const finance = await deps.finance.all()

  const netWorthMinor = latest(finance, 'netWorthMinor')
  const retirementMinor = latest(finance, 'retirementMinor')
  const salaryMinor = latest(finance, 'salaryMinor')
  const creditScore = latest(finance, 'creditScore')
  const savingsMinor = latest(finance, 'savingsMinor')

  return {
    ...(netWorthMinor === undefined ? {} : { netWorthMinor }),
    ...(retirementMinor === undefined ? {} : { retirementMinor }),
    ...(salaryMinor === undefined ? {} : { salaryMinor }),
    ...(creditScore === undefined ? {} : { creditScore }),
    ...(savingsMinor === undefined ? {} : { savingsMinor }),
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
 * A change to one stage, expressed as a change to the arc.
 *
 * Written on top of `editCampaign` rather than beside it. The two were
 * briefly separate paths to the same write and only one carried the
 * identity check, which is exactly how a "no write when nothing
 * changed" rule ends up half-true.
 */
function editStage(
  id: CampaignId,
  stageId: StageId,
  deps: CampaignDeps,
  change: (stage: Stage) => Stage,
): Promise<void> {
  return editCampaign(id, deps, (campaign) => {
    const found = campaign.stages.find((stage) => stage.id === stageId)
    // Identity, so a stage that does not exist writes nothing rather
    // than restamping the record it was not in.
    if (found === undefined) return campaign

    return {
      ...campaign,
      stages: campaign.stages.map((stage) => (stage.id === stageId ? change(stage) : stage)),
    }
  })
}

/**
 * Editing an arc: the label changes, the shape changes, and the one
 * destructive one.
 *
 * All of them route through `editCampaign` for the reason `editStage`
 * exists — a campaign is saved whole, so every edit is a
 * read-modify-write of the same record, and the read has to happen
 * inside the operation rather than in each caller.
 *
 * **`dropStage` is named apart from the rest**, because it is the only
 * one that loses something: a stage reached three times carries three
 * dated records nothing else holds. The rule is that a call site must
 * not be able to ask for "change this" and receive "wipe it", which a
 * single `updateStage(…, { remove: true })` would allow.
 */
export async function renameStageIn(
  id: CampaignId,
  stageId: StageId,
  name: string,
  deps: CampaignDeps,
): Promise<void> {
  await editCampaign(id, deps, (campaign) => renameStage(campaign, stageId, name))
}

export async function retargetStageIn(
  id: CampaignId,
  stageId: StageId,
  requirement: Requirement,
  deps: CampaignDeps,
): Promise<void> {
  await editCampaign(id, deps, (campaign) => retargetStage(campaign, stageId, requirement))
}

export async function moveStageIn(
  id: CampaignId,
  stageId: StageId,
  by: -1 | 1,
  deps: CampaignDeps,
): Promise<void> {
  await editCampaign(id, deps, (campaign) => moveStage(campaign, stageId, by))
}

export async function appendStage(
  id: CampaignId,
  name: string,
  requirement: Requirement,
  deps: CampaignDeps,
): Promise<{ readonly error?: string }> {
  const trimmed = name.trim()
  if (trimmed === '') return { error: 'A stage needs a name.' }

  await editCampaign(id, deps, (campaign) =>
    addStage(campaign, {
      id: deps.ids.next() as StageId,
      name: trimmed,
      requirement,
      reached: [],
    }),
  )

  return {}
}

/** Removes a stage and every record against it. Destructive, and named so. */
export async function dropStage(
  id: CampaignId,
  stageId: StageId,
  deps: CampaignDeps,
): Promise<void> {
  await editCampaign(id, deps, (campaign) => removeStage(campaign, stageId))
}

export async function renameArc(
  id: CampaignId,
  name: string,
  aim: string,
  deps: CampaignDeps,
): Promise<void> {
  await editCampaign(id, deps, (campaign) => renameCampaign(campaign, name, aim))
}

async function editCampaign(
  id: CampaignId,
  deps: CampaignDeps,
  change: (campaign: Campaign) => Campaign,
): Promise<void> {
  const campaign = await deps.campaigns.byId(id)
  if (campaign === undefined) return

  const next = change(campaign)
  // Identity means nothing changed — a blank rename, an out-of-range
  // move — so no write, no sync traffic, and no `updatedAt` churn that
  // would make this device look newer than one that really did change.
  if (next === campaign) return

  await deps.campaigns.save(next)
}

/**
 * The one write a stage edit makes.
 *
 * See `reshapeStage`: firing a rename and a retarget as two mutations
 * raced on the same record and lost the rename.
 */
export async function reshapeStageIn(
  id: CampaignId,
  stageId: StageId,
  name: string,
  requirement: Requirement,
  deps: CampaignDeps,
): Promise<void> {
  await editCampaign(id, deps, (campaign) => reshapeStage(campaign, stageId, name, requirement))
}
