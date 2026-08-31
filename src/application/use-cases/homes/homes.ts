import {
  ranked,
  type CandidateStanding,
  type HomeCandidate,
  type HomeWants,
  type Scored,
} from '@/domain/homes/candidate'
import type { HomeCandidateId, IdGenerator } from '@/domain/ids/ids'
import type { Clock, HomeRepository, NeighbourhoodGateway } from '@/domain/repositories/ports'

/**
 * Houses being considered, and what is around them.
 *
 * **Listings cannot be searched and this does not pretend to.** Zillow,
 * Redfin and Realtor.com were all tested from a browser and all send no
 * CORS header. A candidate is typed in — the same arrangement the resume
 * has — and what the app contributes is the part it genuinely can
 * measure: what is within walking distance of the address.
 *
 * **Nothing here pays XP.** Looking at houses is part of the move, and
 * the move is a campaign, which is a readout. If viewing one should
 * count as a thing done, the honest place for it is a house job on Base
 * with steps — not a second act declared here for the same event.
 */

export interface HomeDeps {
  readonly homes: HomeRepository
  readonly neighbourhoods: NeighbourhoodGateway
  readonly clock: Clock
  readonly ids: IdGenerator
}

export interface NewHome {
  readonly address: string
  readonly point?: { readonly latitude: number; readonly longitude: number }
  readonly priceMinor?: number
  readonly beds?: number
  readonly baths?: number
  readonly link?: string
  readonly notes?: string
}

export async function addHome(
  input: NewHome,
  deps: HomeDeps,
): Promise<{ readonly error?: string }> {
  const address = input.address.trim()
  if (address === '') return { error: 'A house needs an address.' }

  const link = input.link?.trim() ?? ''
  const notes = input.notes?.trim() ?? ''

  await deps.homes.save({
    id: deps.ids.next() as HomeCandidateId,
    address,
    standing: 'considering',
    ...(input.point === undefined ? {} : { point: input.point }),
    ...(input.priceMinor === undefined ? {} : { priceMinor: input.priceMinor }),
    ...(input.beds === undefined ? {} : { beds: input.beds }),
    ...(input.baths === undefined ? {} : { baths: input.baths }),
    ...(link === '' ? {} : { link }),
    ...(notes === '' ? {} : { notes }),
    createdAt: deps.clock.now().toISOString(),
  })

  return {}
}

export async function rankedHomes(
  wants: HomeWants,
  deps: HomeDeps,
): Promise<readonly { readonly candidate: HomeCandidate; readonly scored: Scored }[]> {
  return ranked(await deps.homes.all(), wants)
}

/**
 * Reads what is around one address, and stores the answer on it.
 *
 * **One address at a time, on demand, and remembered afterwards.**
 * Overpass reports two concurrent slots and took 1.8 seconds for a
 * three-kind query around a dense city block — so a screen that read
 * every candidate on load would be both refused and slow. OSM changes
 * over months, so a reading from last week is a fair answer and the
 * stored `readAt` lets a screen say how old it is.
 *
 * A candidate with no point cannot be read: the geocoder has to have
 * resolved the address first. Reported rather than thrown, because an
 * unresolved address is an ordinary state rather than a failure.
 */
export async function readAround(
  id: HomeCandidateId,
  wants: HomeWants,
  deps: HomeDeps,
): Promise<{ readonly error?: string }> {
  const candidate = await deps.homes.byId(id)
  if (candidate === undefined) return {}

  const point = candidate.point
  if (point === undefined) return { error: 'That address has not been placed on the map yet.' }

  const neighbourhood = await deps.neighbourhoods.read(
    point.latitude,
    point.longitude,
    wants.radiusMetres,
    /*
     * Only the kinds wanted. Asking for all eight around a Manhattan
     * address returned 2,300 elements in 13.4 seconds and sometimes
     * timed out entirely; the three defaults took 1.8.
     */
    wants.wanted,
  )

  await deps.homes.save({ ...candidate, neighbourhood })

  return {}
}

export async function setStanding(
  id: HomeCandidateId,
  standing: CandidateStanding,
  deps: HomeDeps,
): Promise<void> {
  const candidate = await deps.homes.byId(id)
  if (candidate === undefined || candidate.standing === standing) return

  await deps.homes.save({ ...candidate, standing })
}

/** Records where the geocoder put an address. */
export async function placeHome(
  id: HomeCandidateId,
  point: { readonly latitude: number; readonly longitude: number },
  deps: HomeDeps,
): Promise<void> {
  const candidate = await deps.homes.byId(id)
  if (candidate === undefined) return

  await deps.homes.save({ ...candidate, point })
}

export async function removeHome(id: HomeCandidateId, deps: HomeDeps): Promise<void> {
  await deps.homes.remove(id)
}

/** How many have actually been viewed, for the move chain to read. */
export async function viewedCount(deps: HomeDeps): Promise<number> {
  const all = await deps.homes.all()

  /*
   * Offered counts as viewed, because you do not offer on a house you
   * have not seen. Ruled out counts too — deciding against one is what
   * viewing is for, and a count that only rose on houses you liked would
   * measure optimism rather than effort.
   */
  return all.filter((one) => one.standing !== 'considering').length
}
