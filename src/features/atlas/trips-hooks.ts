import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addTrip,
  editTrip,
  placeOffTrip,
  placeOnTrip,
  removeTrip,
  tripViews,
  type TripResult,
  type TripView,
} from '@/application/use-cases/atlas/trips'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import type { CreateTripInput, UpdateTripInput } from '@/domain/atlas/trip/TripFactory'
import type { TripId } from '@/domain/atlas/trip/TripId'
import { logger } from '@/shared/logging/logger'

/**
 * Trips, from the UI's side.
 *
 * Writes invalidate `['atlas']` rather than a narrower trips key, because
 * a trip card is mostly read off the places it points at: adding a place
 * to a trip changes what the trip shows, and the map's own counts are
 * derived from the same records.
 */

const ATLAS = ['atlas'] as const

export function useTrips() {
  const services = useServices()

  return useQuery<readonly TripView[]>({
    queryKey: [...ATLAS, 'trips'],
    queryFn: () => tripViews(services),
  })
}

function useTripMutation<TVariables, TResult>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<TResult>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<TResult, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: ATLAS })
    },
  })
}

export function useAddTrip() {
  return useTripMutation<Omit<CreateTripInput, 'id'>, TripResult>(
    'atlas.trip-added',
    (input, services) => addTrip(input, services),
  )
}

export function useEditTrip() {
  return useTripMutation<{ id: TripId; changes: UpdateTripInput }, TripResult>(
    'atlas.trip-edited',
    ({ id, changes }, services) => editTrip(id, changes, services),
  )
}

export function useRemoveTrip() {
  return useTripMutation<TripId, undefined>('atlas.trip-removed', (id, services) =>
    removeTrip(id, services).then(() => undefined),
  )
}

export function usePlaceOnTrip() {
  return useTripMutation<{ id: TripId; placeId: PlaceId }, TripResult>(
    'atlas.trip-place-added',
    ({ id, placeId }, services) => placeOnTrip(id, placeId, services),
  )
}

export function usePlaceOffTrip() {
  return useTripMutation<{ id: TripId; placeId: PlaceId }, TripResult>(
    'atlas.trip-place-removed',
    ({ id, placeId }, services) => placeOffTrip(id, placeId, services),
  )
}
