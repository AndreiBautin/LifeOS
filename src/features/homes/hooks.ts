import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices, useSettings } from '@/app/context'
import {
  addHome,
  placeHome,
  rankedHomes,
  readAround,
  removeHome,
  setStanding,
  type NewHome,
} from '@/application/use-cases/homes/homes'
import type { CandidateStanding } from '@/domain/homes/candidate'
import type { HomeCandidateId } from '@/domain/ids/ids'

export const HOMES = ['homes'] as const

export function useHomes() {
  const services = useServices()
  const { settings } = useSettings()

  return useQuery({
    queryKey: [...HOMES, settings.homeWants],
    queryFn: () => rankedHomes(settings.homeWants, services),
  })
}

/**
 * Every house mutation, on one path.
 *
 * **Nothing here awards XP**, and the absence is deliberate rather than
 * an oversight. Looking at houses is part of the move, and the move is a
 * campaign — a readout. If viewing one should count as a thing done, the
 * honest place for it is a house job on Base with steps, not a second
 * act declared for the same event.
 *
 * The campaign key is invalidated alongside, because a house moving to
 * "viewed" is what the `homes-viewed` requirement reads.
 */
function useHomeMutation<T>(
  run: (input: T, services: ReturnType<typeof useServices>) => Promise<unknown>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: T) => run(input, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: HOMES })
      void client.invalidateQueries({ queryKey: ['campaigns'] })
    },
  })
}

export function useAddHome() {
  return useHomeMutation<NewHome>((input, services) => addHome(input, services))
}

export function useSetStanding() {
  return useHomeMutation<{ id: HomeCandidateId; standing: CandidateStanding }>(
    ({ id, standing }, services) => setStanding(id, standing, services),
  )
}

export function usePlaceHome() {
  return useHomeMutation<{
    id: HomeCandidateId
    point: { latitude: number; longitude: number }
  }>(({ id, point }, services) => placeHome(id, point, services))
}

export function useRemoveHome() {
  return useHomeMutation<HomeCandidateId>((id, services) => removeHome(id, services))
}

/**
 * Reading what is around one house.
 *
 * A mutation rather than a query, because it is a thing you ask for
 * rather than something a screen needs — Overpass reports two concurrent
 * slots and took nearly two seconds for the narrowest useful query, so
 * a list that read every candidate on load would be both slow and
 * refused. The answer is stored on the candidate, and OSM changes over
 * months, so it is worth keeping.
 */
export function useReadAround() {
  const services = useServices()
  const { settings } = useSettings()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: HomeCandidateId) => readAround(id, settings.homeWants, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: HOMES })
    },
  })
}
