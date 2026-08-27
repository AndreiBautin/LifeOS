import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  editPlace,
  placeFromText,
  unplacedPlaces,
  type AtlasResult,
} from '@/application/use-cases/atlas/atlas'
import type { Place } from '@/domain/atlas/place/Place'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import { logger } from '@/shared/logging/logger'

const ATLAS = ['atlas'] as const

export function useUnplaced() {
  const services = useServices()

  return useQuery<readonly Place[]>({
    queryKey: [...ATLAS, 'unplaced'],
    queryFn: () => unplacedPlaces(services),
  })
}

function useInboxMutation<TVariables>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<AtlasResult>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<AtlasResult, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: ATLAS })
    },
  })
}

export function usePlaceFromText() {
  return useInboxMutation<{ id: PlaceId; text: string }>(
    'atlas.place-located-from-text',
    ({ id, text }, services) => placeFromText(id, text, services),
  )
}

/**
 * "I am standing here."
 *
 * A single reading rather than a watch: this is one answer to one
 * question, and leaving a receiver running for it would be a battery cost
 * with nothing asking for it.
 *
 * Deliberately not gated on accuracy, unlike the fog. Clearing ground you
 * did not walk cannot be undone; putting a pin fifty metres out is a
 * correction away, and refusing to save anything until the device is
 * confident would make the button feel broken indoors.
 */
export function useHereFor() {
  return useInboxMutation<PlaceId>('atlas.place-located-here', async (id, services) => {
    const fix = await services.geolocation.getCurrentPosition()
    if (!fix.ok) return { error: fix.error.message }

    return editPlace(id, { latitude: fix.value.latitude, longitude: fix.value.longitude }, services)
  })
}
