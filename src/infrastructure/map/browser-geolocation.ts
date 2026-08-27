import { createCoordinates } from '@/domain/atlas/place/Coordinates'
import type {
  Geolocation as GeolocationPort,
  GeolocationError,
  GeolocationFix,
  StopWatching,
} from '@/domain/atlas/Geolocation'
import { err, ok, type Result } from '@/domain/atlas/shared/Result'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'

/**
 * The browser's Geolocation API, behind the domain's port.
 *
 * Everything here is about degrading rather than throwing. A denied
 * permission, a device with no receiver, a fix that never arrives — each
 * is an ordinary state of the world on a phone in a building, and none of
 * them should reach a component as an exception.
 */

const CODES: Readonly<Record<number, GeolocationError['code']>> = {
  1: 'permission-denied',
  2: 'position-unavailable',
  3: 'timeout',
}

function toError(error: GeolocationPositionError): GeolocationError {
  return {
    code: CODES[error.code] ?? 'position-unavailable',
    message: error.message,
  }
}

const UNSUPPORTED: GeolocationError = {
  code: 'unsupported',
  message: 'This device cannot report its location.',
}

/**
 * High accuracy, and a long timeout.
 *
 * The accuracy matters because the fog is drawn in 150-metre squares and a
 * coarse network fix is rejected outright — see `recordPosition`. The
 * timeout is generous because a cold GPS lock outdoors genuinely takes
 * tens of seconds, and failing early would mean reporting "unavailable"
 * for a receiver that was about to work.
 */
const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 30_000,
  maximumAge: 0,
}

function toCoordinates(position: GeolocationPosition): Result<Coordinates, GeolocationError> {
  const coordinates = createCoordinates(position.coords.latitude, position.coords.longitude)

  return coordinates.ok
    ? ok(coordinates.value)
    : err({ code: 'position-unavailable', message: coordinates.error.message })
}

export function createBrowserGeolocation(): GeolocationPort {
  return {
    getCurrentPosition() {
      if (typeof navigator === 'undefined') {
        return Promise.resolve(err<GeolocationError, Coordinates>(UNSUPPORTED))
      }

      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve(toCoordinates(position))
          },
          (error) => {
            resolve(err(toError(error)))
          },
          OPTIONS,
        )
      })
    },

    watchPosition(
      onFix: (fix: GeolocationFix) => void,
      onError?: (error: GeolocationError) => void,
    ): StopWatching {
      if (typeof navigator === 'undefined') {
        onError?.(UNSUPPORTED)
        return () => undefined
      }

      const id = navigator.geolocation.watchPosition(
        (position) => {
          const coordinates = toCoordinates(position)
          if (!coordinates.ok) {
            onError?.(coordinates.error)
            return
          }

          onFix({
            coordinates: coordinates.value,
            accuracyMeters: position.coords.accuracy,
            at: new Date(position.timestamp),
          })
        },
        (error) => {
          /*
           * Not terminal. A watch can report a timeout walking under a
           * bridge and recover on the other side, so this reports and
           * keeps watching rather than tearing the watch down.
           */
          onError?.(toError(error))
        },
        OPTIONS,
      )

      // Safe to call more than once: clearing an already-cleared id is a
      // no-op, and a component unmounting twice under StrictMode should
      // not have to know that.
      return () => {
        navigator.geolocation.clearWatch(id)
      }
    },
  }
}
