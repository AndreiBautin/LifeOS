import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addCampaign,
  campaignStandings,
  reachStage,
  removeCampaign,
  undoStage,
  type NewCampaign,
} from '@/application/use-cases/campaign/campaign'
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
