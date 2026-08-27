import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useServices } from '@/app/context'
import {
  editPlace,
  placeFromText,
  unplacedPlaces,
  type AtlasResult,
} from '@/application/use-cases/atlas/atlas'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
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

/**
 * Turning a typed name into a point.
 *
 * The one thing in the atlas that leaves the device. It asks Nominatim,
 * which is the same organisation whose tiles the map already draws on
 * every pan — so this is a wider use of an existing relationship rather
 * than a new one. What it sends is the text typed into the box.
 *
 * Nominatim is run on donations and allows one request a second, so the
 * query is debounced here and the adapter enforces the floor again on the
 * way out. `enabled` keeps it from firing on an empty or barely-started
 * box: two characters is not a search, it is somebody still typing.
 */
export function usePlaceSearch(text: string, near?: Coordinates) {
  const services = useServices()
  const query = useDebounced(text, 500)

  return useQuery({
    queryKey: [...ATLAS, 'search', query, near?.latitude, near?.longitude],
    enabled: query.trim().length >= 3,
    // A place does not move, so a repeated search is worth keeping.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await services.placeSearch.search({
        text: query,
        ...(near === undefined ? {} : { near }),
      })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  })
}

/**
 * The typed value, but only once it stops changing.
 *
 * Without this every keystroke is a request to a service that allows one
 * a second, and the adapter's own floor would turn a typed word into a
 * queue of stale searches resolving one per second after you stopped.
 */
function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value)
    }, ms)
    return () => {
      clearTimeout(timer)
    }
  }, [value, ms])

  return settled
}
