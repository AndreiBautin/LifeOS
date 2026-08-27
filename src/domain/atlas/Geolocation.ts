import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Result } from '@/domain/atlas/shared/Result'

export type GeolocationErrorCode =
  'permission-denied' | 'position-unavailable' | 'timeout' | 'unsupported'

export interface GeolocationError {
  readonly code: GeolocationErrorCode
  readonly message: string
}

/**
 * A single reading. `accuracyMeters` is the radius the device claims the true
 * position lies within — worth showing rather than hiding, because it is
 * routinely tens of metres, and arrival detection is only as trustworthy as
 * this number.
 */
export interface GeolocationFix {
  readonly coordinates: Coordinates
  readonly accuracyMeters: number
  readonly at: Date
}

/** Called to stop a watch; safe to call more than once. */
export type StopWatching = () => void

/**
 * Abstracts the browser Geolocation API so the current position can be faked
 * in tests and so the app degrades gracefully when location is unavailable
 * or denied, rather than throwing.
 */
export interface Geolocation {
  getCurrentPosition(): Promise<Result<Coordinates, GeolocationError>>

  /**
   * Streams readings until the returned function is called. Errors are
   * delivered to `onError` rather than thrown, and a watch may report an
   * error and then recover, so neither callback is terminal.
   */
  watchPosition(
    onFix: (fix: GeolocationFix) => void,
    onError?: (error: GeolocationError) => void,
  ): StopWatching
}
