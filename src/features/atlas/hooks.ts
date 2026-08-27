import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useServices } from '@/app/context'
import {
  addPlace,
  atlasView,
  editPlace,
  favouritePlace,
  recordPosition,
  removePlace,
  visitPlace,
  type AtlasResult,
} from '@/application/use-cases/atlas/atlas'
import type { CreatePlaceInput, UpdatePlaceInput } from '@/domain/atlas/place/PlaceFactory'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import type { GeolocationError, GeolocationFix } from '@/domain/atlas/Geolocation'
import { logger } from '@/shared/logging/logger'

/**
 * The atlas, from the UI's side.
 *
 * Every write invalidates `['atlas']`, which covers both the places and
 * the fog: marking somewhere visited reveals the ground it stands on, so a
 * narrower key would leave the map showing fog over a place the list says
 * you have been to.
 */

const ATLAS = ['atlas'] as const

export function useAtlas() {
  const services = useServices()

  return useQuery({ queryKey: [...ATLAS, 'view'], queryFn: () => atlasView(services) })
}

function useAtlasMutation<TVariables, TResult>(
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

export function useAddPlace() {
  return useAtlasMutation<Omit<CreatePlaceInput, 'id'>, AtlasResult>(
    'atlas.place-added',
    (input, services) => addPlace(input, services),
  )
}

export function useEditPlace() {
  return useAtlasMutation<{ id: PlaceId; changes: UpdatePlaceInput }, AtlasResult>(
    'atlas.place-edited',
    ({ id, changes }, services) => editPlace(id, changes, services),
  )
}

export function useVisitPlace() {
  return useAtlasMutation<PlaceId, AtlasResult>('atlas.place-visited', (id, services) =>
    visitPlace(id, services),
  )
}

export function useFavouritePlace() {
  return useAtlasMutation<PlaceId, AtlasResult>('atlas.place-favourited', (id, services) =>
    favouritePlace(id, services),
  )
}

export function useRemovePlace() {
  return useAtlasMutation<PlaceId, undefined>('atlas.place-removed', (id, services) =>
    removePlace(id, services).then(() => undefined),
  )
}

export interface WalkState {
  readonly following: boolean
  readonly fix?: GeolocationFix
  readonly error?: GeolocationError
  readonly revealed: number
  readonly start: () => void
  readonly stop: () => void
}

/**
 * Following your own position, and clearing fog as you walk.
 *
 * The one part of this feature that is genuinely stateful, and the one
 * that has to be careful. Three things it does deliberately:
 *
 * **The watch is torn down on unmount, always.** A geolocation watch left
 * running is a receiver left on, which on a phone is a battery reading
 * somebody will notice and not be able to explain.
 *
 * **Writes are skipped when nothing was revealed.** A walk produces a
 * reading every second or two and almost all of them land in a cell
 * already cleared; `recordPosition` reports how many were new, and zero
 * means no write and no re-render.
 *
 * **The query is only invalidated when the fog actually moved.** Otherwise
 * following would re-render the whole map on every reading, which on a
 * phone in a pocket is the difference between a walk and a flat battery.
 */
export function useWalk(): WalkState {
  const services = useServices()
  const client = useQueryClient()

  const [following, setFollowing] = useState(false)
  const [fix, setFix] = useState<GeolocationFix | undefined>(undefined)
  const [error, setError] = useState<GeolocationError | undefined>(undefined)
  const [revealed, setRevealed] = useState(0)

  const stopRef = useRef<(() => void) | undefined>(undefined)

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = undefined
    setFollowing(false)
  }, [])

  const start = useCallback(() => {
    if (stopRef.current !== undefined) return

    setError(undefined)
    // This walk's count, not every walk's. Left to accumulate it reads as
    // one enormous walk that never ended, which is exactly what it looked
    // like the first time this was driven.
    setRevealed(0)
    setFollowing(true)

    stopRef.current = services.geolocation.watchPosition(
      (next) => {
        setFix(next)

        void recordPosition(next.coordinates, next.accuracyMeters, services).then((count) => {
          if (count === 0) return

          setRevealed((total) => total + count)
          void client.invalidateQueries({ queryKey: ATLAS })
        })
      },
      (problem) => {
        setError(problem)
      },
    )
  }, [client, services])

  // Whatever else happens, the receiver goes off with the screen.
  useEffect(() => stop, [stop])

  return {
    following,
    ...(fix === undefined ? {} : { fix }),
    ...(error === undefined ? {} : { error }),
    revealed,
    start,
    stop,
  }
}
