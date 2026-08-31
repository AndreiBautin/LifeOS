import {
  overpassQuery,
  readNeighbourhood,
  type NearbyKind,
  type Neighbourhood,
} from '@/domain/homes/neighbourhood'
import type { Clock, NeighbourhoodGateway } from '@/domain/repositories/ports'

/**
 * The only thing that asks OpenStreetMap what is around a point.
 *
 * **This is the same third party the map already uses**, not a new one:
 * tiles come from `tile.openstreetmap.org` and geocoding from Nominatim,
 * and Overpass is the third face of the same project. It is still a
 * service run on donations, and everything below is about not abusing
 * it.
 *
 * **Read on demand, one address at a time.** `/api/status` reports **two
 * concurrent slots**, so anything that fanned out over a list of
 * candidates would be refused — and the result is stored on the
 * candidate afterwards, because OSM changes over months and a reading
 * from last week is a fair answer.
 *
 * **POST rather than GET**, because the query is long enough to run into
 * URL limits once several kinds are asked for.
 */
export function createNeighbourhoodGateway(clock: Clock): NeighbourhoodGateway {
  return {
    async read(
      latitude: number,
      longitude: number,
      radiusMetres: number,
      kinds: readonly NearbyKind[],
    ): Promise<Neighbourhood> {
      const query = overpassQuery(latitude, longitude, radiusMetres, kinds)

      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      })

      /*
       * **Checked before parsing, because a failure here is HTML.**
       * Overpass answers a timed-out query with a 504 and an XHTML error
       * page — observed, not guessed — so `response.json()` on a failed
       * request throws a `SyntaxError` about an unexpected `<`, which is
       * the least useful message this could produce. A timeout is the
       * commonest thing that goes wrong: asking for all eight kinds
       * around a Manhattan address took 13.4 seconds and sometimes did
       * not finish at all.
       */
      if (!response.ok) {
        throw new Error(`OpenStreetMap answered ${String(response.status)}`)
      }

      return readNeighbourhood(
        await response.json(),
        radiusMetres,
        clock.now().toISOString(),
        // What was asked for, so a kind nobody queried reads as
        // unmeasured rather than as a zero.
        kinds,
      )
    },
  }
}
