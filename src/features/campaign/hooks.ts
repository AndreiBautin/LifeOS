import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addCampaign,
  appendStage,
  dropStage,
  moveStageIn,
  renameArc,
  renameStageIn,
  reshapeStageIn,
  retargetStageIn,
  campaignStandings,
  reachStage,
  removeCampaign,
  undoStage,
  type NewCampaign,
} from '@/application/use-cases/campaign/campaign'
import type { Requirement } from '@/domain/campaign/campaign'
import type { CampaignId, StageId } from '@/domain/ids/ids'

export const CAMPAIGNS = ['campaigns'] as const

/**
 * The arcs, read against live evidence every time.
 *
 * The key includes nothing about the areas it reads from, so a house job
 * finished on Base does not invalidate this by itself — the mutations
 * that close one do. That is why every campaign mutation invalidates the
 * whole prefix rather than a single record, and why the project hooks
 * invalidate it too.
 */
export function useCampaigns() {
  const services = useServices()

  return useQuery({
    queryKey: CAMPAIGNS,
    queryFn: () => campaignStandings(services),
  })
}

/**
 * Every campaign mutation, on one path.
 *
 * **Nothing here awards XP**, unlike almost every other mutation hook in
 * the app. Every stage is met by work that already paid in its own area,
 * and paying again would be the same effort counted twice — rule three.
 * The absence of an `xp-award` call is deliberate rather than an
 * oversight, which is why it is written down here.
 */
function useCampaignMutation<T>(
  run: (input: T, services: ReturnType<typeof useServices>) => Promise<unknown>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: T) => run(input, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: CAMPAIGNS })
    },
  })
}

export function useAddCampaign() {
  return useCampaignMutation<NewCampaign>((input, services) => addCampaign(input, services))
}

export function useReachStage() {
  return useCampaignMutation<{ id: CampaignId; stageId: StageId; note?: string }>(
    ({ id, stageId, note }, services) => reachStage(id, stageId, note, services),
  )
}

export function useUndoStage() {
  return useCampaignMutation<{ id: CampaignId; stageId: StageId }>(({ id, stageId }, services) =>
    undoStage(id, stageId, services),
  )
}

export function useRemoveCampaign() {
  return useCampaignMutation<CampaignId>((id, services) => removeCampaign(id, services))
}

export function useRenameStage() {
  return useCampaignMutation<{ id: CampaignId; stageId: StageId; name: string }>(
    ({ id, stageId, name }, services) => renameStageIn(id, stageId, name, services),
  )
}

export function useRetargetStage() {
  return useCampaignMutation<{ id: CampaignId; stageId: StageId; requirement: Requirement }>(
    ({ id, stageId, requirement }, services) => retargetStageIn(id, stageId, requirement, services),
  )
}

export function useMoveStage() {
  return useCampaignMutation<{ id: CampaignId; stageId: StageId; by: -1 | 1 }>(
    ({ id, stageId, by }, services) => moveStageIn(id, stageId, by, services),
  )
}

export function useAppendStage() {
  return useCampaignMutation<{ id: CampaignId; name: string; requirement: Requirement }>(
    ({ id, name, requirement }, services) => appendStage(id, name, requirement, services),
  )
}

/** Destructive, and named apart from every other stage edit. */
export function useDropStage() {
  return useCampaignMutation<{ id: CampaignId; stageId: StageId }>(({ id, stageId }, services) =>
    dropStage(id, stageId, services),
  )
}

export function useRenameArc() {
  return useCampaignMutation<{ id: CampaignId; name: string; aim: string }>(
    ({ id, name, aim }, services) => renameArc(id, name, aim, services),
  )
}

/** A stage's name and requirement, in one write. See `reshapeStage`. */
export function useReshapeStage() {
  return useCampaignMutation<{
    id: CampaignId
    stageId: StageId
    name: string
    requirement: Requirement
  }>(({ id, stageId, name, requirement }, services) =>
    reshapeStageIn(id, stageId, name, requirement, services),
  )
}
