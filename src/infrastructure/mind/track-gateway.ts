import { readTrack, type TrackExercise, type TrackId } from '@/domain/mind/tracks'
import type { TrackGateway } from '@/domain/repositories/ports'

/**
 * The only thing that fetches practice exercises.
 *
 * **Exercism's own API is not usable and this goes round it.** Their
 * `/api/v2` is internal, needs a token and is CORS-blocked from a
 * browser — tested rather than assumed. Their *content* is open: each
 * track is a public GitHub repository, and `raw.githubusercontent.com`
 * serves `config.json` to a browser with no key. One request returned
 * 111 practice exercises for TypeScript.
 *
 * `raw.githubusercontent.com` rather than `api.github.com`, because the
 * API's unauthenticated limit is 60 requests an hour per IP and raw file
 * serving is not metered the same way. Either would be fine at one
 * request per track per session; this is the cheaper of the two.
 *
 * That makes seven outbound hosts. **Each one is a decision, not a
 * precedent.**
 */
export function createTrackGateway(): TrackGateway {
  return {
    async read(track: TrackId): Promise<readonly TrackExercise[]> {
      const response = await fetch(
        `https://raw.githubusercontent.com/exercism/${track}/main/config.json`,
        { headers: { accept: 'application/json' } },
      )

      /*
       * Thrown rather than returned empty, so a screen can tell a track
       * that could not be read from one with nothing in it. The same
       * rule the board sweep and the digest follow.
       */
      if (!response.ok) {
        throw new Error(`${track} answered ${String(response.status)}`)
      }

      return readTrack(await response.json())
    },
  }
}
