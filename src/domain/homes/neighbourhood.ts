/**
 * What is actually around a point, from OpenStreetMap.
 *
 * **The listings cannot be fetched and the neighbourhood can.** That
 * split is the whole design, and it was measured rather than assumed:
 * Zillow, Redfin and Realtor.com are all reachable and all send no CORS
 * header, so a browser cannot read them — and neither can the US Census
 * API, which was the other obvious source. Overpass answers a browser
 * directly and returned 536 amenities within 1.5 km of a Manhattan point
 * in four and a half seconds.
 *
 * So a house is **typed in** and its surroundings are **measured**,
 * which is exactly the shape the job search already has: the resume is
 * typed and the boards are read. Nothing here pretends to search
 * listings, and the screen says so rather than leaving somebody to
 * discover it.
 *
 * **OSM completeness is uneven and that is a real limitation, not a
 * caveat.** A dense city is mapped in detail and a rural county is not,
 * so a low count means either "nothing there" or "nobody has mapped it"
 * and this cannot tell which. Two addresses in the same town compare
 * fairly; an address in Manhattan against one in rural Vermont does not.
 * The screen states it.
 */

/**
 * The kinds counted, and what each is asked for in OSM's tagging.
 *
 * A fixed list rather than free text, because each entry is a *query* —
 * OSM's tags are a controlled vocabulary and `shop=supermarket` finds
 * groceries where `amenity=supermarket` finds nothing. Letting somebody
 * type a category would be offering a search box over a schema they
 * cannot see.
 */
export const NEARBY_KINDS = [
  'groceries',
  'schools',
  'parks',
  'transit',
  'cafes',
  'restaurants',
  'healthcare',
  'gyms',
] as const

export type NearbyKind = (typeof NEARBY_KINDS)[number]

export const NEARBY_LABELS: Record<NearbyKind, string> = {
  groceries: 'Groceries',
  schools: 'Schools',
  parks: 'Parks',
  transit: 'Transit',
  cafes: 'Cafés',
  restaurants: 'Restaurants',
  healthcare: 'Healthcare',
  gyms: 'Gyms',
}

/**
 * The OSM selectors behind each kind.
 *
 * Several per kind, because OSM splits things a person does not: a park
 * is tagged on a node *and* on a way, a station is `public_transport`
 * but a bus stop is `highway`. Getting this wrong reads as a
 * neighbourhood with no transit rather than as a query that asked the
 * wrong question.
 */
export const NEARBY_SELECTORS: Record<NearbyKind, readonly string[]> = {
  groceries: ['node[shop=supermarket]', 'node[shop=grocery]', 'way[shop=supermarket]'],
  schools: ['node[amenity=school]', 'way[amenity=school]'],
  parks: ['node[leisure=park]', 'way[leisure=park]', 'way[leisure=garden]'],
  transit: ['node[public_transport=station]', 'node[railway=station]', 'node[highway=bus_stop]'],
  cafes: ['node[amenity=cafe]'],
  restaurants: ['node[amenity=restaurant]'],
  healthcare: ['node[amenity=pharmacy]', 'node[amenity=doctors]', 'node[amenity=hospital]'],
  gyms: ['node[leisure=fitness_centre]', 'node[amenity=gym]'],
}

export interface Neighbourhood {
  /** How many of each kind were found, within the radius asked for. */
  readonly counts: Readonly<Record<NearbyKind, number>>
  /**
   * Which kinds were actually asked for.
   *
   * **Without this a zero is a lie.** The query only fetches the kinds
   * you said you wanted, so `counts.schools` is 0 both when there are no
   * schools and when nobody asked about schools — and adding schools to
   * your wants afterwards would drop the score against something never
   * measured. Absent, never zero: a kind outside this list has not been
   * looked at, and scoring skips it until it has.
   *
   * **Optional, because stored records outlive the type that wrote
   * them.** A reading taken before this field existed has none, and
   * every read path has to survive that — the first version made it
   * required and `asked.includes(...)` threw on the one record already
   * in the database, taking the whole screen down. A reading with no
   * `asked` is treated as having measured nothing, which is the
   * conservative answer: it prompts a re-read rather than scoring
   * against counts whose provenance is unknown.
   */
  readonly asked?: readonly NearbyKind[]
  /** Metres. Recorded, because a count means nothing without it. */
  readonly radiusMetres: number
  /** When it was read. OSM changes slowly; this is not live. */
  readonly readAt: string
}

/**
 * Which kind an OSM element answers to.
 *
 * Read off the tags rather than from which part of the query matched,
 * because Overpass returns one flat list and does not say which clause
 * produced a given element. The order matters where tags overlap — a
 * hospital with a café inside it is healthcare — so this returns the
 * first kind that claims it rather than counting it twice.
 */
export function kindOf(tags: Readonly<Record<string, string>> | undefined): NearbyKind | undefined {
  if (tags === undefined) return undefined

  if (tags.shop === 'supermarket' || tags.shop === 'grocery') return 'groceries'
  if (tags.amenity === 'school') return 'schools'
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'parks'
  if (
    tags.public_transport === 'station' ||
    tags.railway === 'station' ||
    tags.highway === 'bus_stop'
  ) {
    return 'transit'
  }
  if (tags.amenity === 'pharmacy' || tags.amenity === 'doctors' || tags.amenity === 'hospital') {
    return 'healthcare'
  }
  if (tags.leisure === 'fitness_centre' || tags.amenity === 'gym') return 'gyms'
  if (tags.amenity === 'cafe') return 'cafes'
  if (tags.amenity === 'restaurant') return 'restaurants'

  return undefined
}

export const EMPTY_COUNTS: Readonly<Record<NearbyKind, number>> = Object.fromEntries(
  NEARBY_KINDS.map((kind) => [kind, 0]),
) as Record<NearbyKind, number>

/**
 * Turns an Overpass response into counts. Pure; nothing here fetches.
 *
 * Elements with no recognised tag are dropped rather than counted as
 * something — a query returns what it was asked for and occasionally a
 * little more, and guessing at an untagged node would put a number on
 * the screen that nothing produced.
 */
export function readNeighbourhood(
  payload: unknown,
  radiusMetres: number,
  readAt: string,
  asked: readonly NearbyKind[] = NEARBY_KINDS,
): Neighbourhood {
  const counts: Record<NearbyKind, number> = { ...EMPTY_COUNTS }

  const elements = (payload as { elements?: unknown } | undefined)?.elements
  if (Array.isArray(elements)) {
    for (const raw of elements) {
      if (typeof raw !== 'object' || raw === null) continue

      const tags = (raw as { tags?: unknown }).tags
      const kind = kindOf(
        typeof tags === 'object' && tags !== null ? (tags as Record<string, string>) : undefined,
      )

      if (kind !== undefined) counts[kind] += 1
    }
  }

  return { counts, radiusMetres, readAt, asked: [...asked] }
}

/**
 * The Overpass query for a point, asking only for the kinds wanted.
 *
 * **Only the wanted kinds, and that was measured.** Asking for all eight
 * around a Manhattan address returned 2,300 elements in **13.4 seconds**
 * — of which 1,167 were cafés and restaurants nobody had asked about.
 * The three default kinds are a fraction of that. Overpass is a free
 * service run on donations and the query is the expensive part, so
 * fetching what nothing will read is the sort of waste the restraint
 * towards Nominatim exists to prevent.
 *
 * One query rather than one per kind, for the same reason from the other
 * direction: eight round trips where one would do is eight times the
 * handshake for the same answer.
 *
 * `out tags center` rather than `out body` — the geometry of every park
 * boundary is tens of kilobytes and nothing here draws them.
 */
export function overpassQuery(
  latitude: number,
  longitude: number,
  radiusMetres: number,
  kinds: readonly NearbyKind[] = NEARBY_KINDS,
): string {
  const around = `(around:${String(Math.round(radiusMetres))},${String(latitude)},${String(longitude)})`

  const clauses = kinds
    .flatMap((kind) => NEARBY_SELECTORS[kind].map((selector) => `${selector}${around};`))
    .join('\n  ')

  return `[out:json][timeout:25];\n(\n  ${clauses}\n);\nout tags center;`
}
