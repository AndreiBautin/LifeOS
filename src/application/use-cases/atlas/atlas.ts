import { toCellId, type CellId } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import { isResolved, type Place } from '@/domain/atlas/place/Place'
import { createPlaceId } from '@/domain/atlas/place/PlaceId'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import {
  createPlace,
  markVisited,
  toggleFavorite,
  updatePlace,
  type CreatePlaceInput,
  type UpdatePlaceInput,
} from '@/domain/atlas/place/PlaceFactory'
import { createCategoryRegistry } from '@/domain/atlas/category/CategoryDefinition'
import type { CategoryDefinition, CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { IdGenerator } from '@/domain/ids/ids'
import type { Clock, ExploredAreaRepository, PlaceRepository } from '@/domain/repositories/ports'

import { allExploredCells, revealCell, summarizeExploration } from './exploration'
import { parseBulkCapture, type BulkCaptureParseResult } from './ParseBulkCapture'
import { parseSharedLocation, type SharedLocation } from './ParseSharedLocation'

/**
 * The atlas, from the application's side.
 *
 * This is the boundary the plan called step 5d: the atlas domain returns
 * `Result<T, E>` where the rest of the hub throws, and rather than
 * rewriting fifteen thousand lines to match, `Result` stays inside
 * `domain/atlas/` and gets unwrapped here. Every function below returns
 * `{ error }` rather than throwing, which is the same shape the quest log
 * and the tech tree already use for refusals a person can act on.
 */

/**
 * The categories a place can belong to.
 *
 * Data, and shipped rather than stored — the same decision Lift already
 * made for the exercise catalogue and Backlogs for its content types. A
 * store of record for shipped content is what makes an edit undeliverable.
 */
export const ATLAS_CATEGORIES: readonly CategoryDefinition[] = [
  { id: 'food' as CategoryId, label: 'Food & drink', icon: '🍜' },
  { id: 'outdoors' as CategoryId, label: 'Outdoors', icon: '🌲' },
  { id: 'culture' as CategoryId, label: 'Culture', icon: '🎭' },
  { id: 'shops' as CategoryId, label: 'Shops', icon: '🛍️' },
  { id: 'landmarks' as CategoryId, label: 'Landmarks', icon: '📍' },
  { id: 'other' as CategoryId, label: 'Other', icon: '✳️' },
]

export const ATLAS_REGISTRY = createCategoryRegistry(ATLAS_CATEGORIES)

export interface AtlasDeps {
  readonly places: PlaceRepository
  readonly explored: ExploredAreaRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}

export type AtlasResult =
  | { readonly place: Place; readonly error?: undefined }
  | { readonly place?: undefined; readonly error: string }

/** Validation errors as one sentence, because a screen shows a sentence. */
function firstMessage(errors: readonly { readonly message: string }[]): string {
  return errors[0]?.message ?? 'That could not be saved.'
}

export async function addPlace(
  input: Omit<CreatePlaceInput, 'id'>,
  deps: AtlasDeps,
): Promise<AtlasResult> {
  const id = createPlaceId(deps.ids.next())
  if (!id.ok) return { error: id.error.message }

  const created = createPlace({ ...input, id: id.value }, ATLAS_REGISTRY, deps.clock.now())
  if (!created.ok) return { error: firstMessage(created.error) }

  await deps.places.save(created.value)
  return { place: created.value }
}

export async function editPlace(
  id: PlaceId,
  changes: UpdatePlaceInput,
  deps: AtlasDeps,
): Promise<AtlasResult> {
  const existing = await deps.places.byId(id)
  if (existing === undefined) return { error: 'That place no longer exists.' }

  const updated = updatePlace(existing, changes, ATLAS_REGISTRY)
  if (!updated.ok) return { error: firstMessage(updated.error) }

  await deps.places.save(updated.value)
  return { place: updated.value }
}

/**
 * Marks a place visited, and reveals the ground it stands on.
 *
 * The reveal is not stored — cells from visited places are *derived* from
 * the places themselves, so editing or un-visiting one stays correct with
 * no second copy of the truth to drift. What is stored is only what you
 * walked.
 */
export async function visitPlace(id: PlaceId, deps: AtlasDeps): Promise<AtlasResult> {
  const existing = await deps.places.byId(id)
  if (existing === undefined) return { error: 'That place no longer exists.' }

  const visited = markVisited(existing, deps.clock.now())
  await deps.places.save(visited)
  return { place: visited }
}

export async function favouritePlace(id: PlaceId, deps: AtlasDeps): Promise<AtlasResult> {
  const existing = await deps.places.byId(id)
  if (existing === undefined) return { error: 'That place no longer exists.' }

  const toggled = toggleFavorite(existing)
  await deps.places.save(toggled)
  return { place: toggled }
}

export async function removePlace(id: PlaceId, deps: AtlasDeps): Promise<void> {
  await deps.places.remove(id)
}

export async function listPlaces(deps: AtlasDeps): Promise<readonly Place[]> {
  return deps.places.all()
}

export interface BulkAddResult {
  readonly added: number
  readonly skipped: BulkCaptureParseResult
}

/**
 * A pasted list of names, saved as name-only places.
 *
 * No points, deliberately. This is the "mind dump" path — twelve
 * restaurants somebody listed in a message — and demanding a coordinate
 * for each would turn a thirty-second paste into an evening. They land
 * unresolved and can be given a point later.
 *
 * The parse decides what is worth saving; everything it rejected comes
 * back so the screen can say *why* rather than silently saving nine of
 * twelve.
 */
export async function bulkAddPlaces(
  text: string,
  categoryId: CategoryId,
  deps: AtlasDeps,
): Promise<BulkAddResult> {
  const existing = await deps.places.all()
  const parsed = parseBulkCapture(text, { existingNames: existing.map((place) => place.name) })

  let added = 0
  for (const entry of parsed.entries) {
    const result = await addPlace({ name: entry.name, categoryId }, deps)
    if (result.place !== undefined) added += 1
  }

  return { added, skipped: parsed }
}

/**
 * Something shared into the app from a maps application.
 *
 * The parse is local and offline — it reads a Google, Apple, OSM or `geo:`
 * link for a point and a name. What it cannot do is follow a shortened
 * link: `maps.app.goo.gl` only resolves behind an HTTP redirect a browser
 * cannot follow cross-origin, so those come back with `needsRedirect` and
 * whatever name was in the text, which is still enough to save something
 * and place it later.
 */
/**
 * A saved place of the same name still waiting for a point.
 *
 * Matched on name, case-insensitively, and only when it has no coordinates
 * — the pair of features above make this the common case rather than an
 * edge one. You paste a list of twelve names from a message, and weeks
 * later share the link for one of them from a maps app. Adding a second
 * "Kiln" beside the first is the wrong answer to that; the share is the
 * missing half of a place already on the list.
 *
 * A place that *has* a point is left alone, because then the share really
 * is about somewhere else with the same name — two branches of the same
 * chain, which is a thing that exists.
 */
function unresolvedNamed(places: readonly Place[], name: string): Place | undefined {
  const wanted = name.trim().toLowerCase()
  return places.find((place) => place.name.trim().toLowerCase() === wanted && !isResolved(place))
}

export async function addSharedLocation(
  input: { readonly text: string; readonly categoryId: CategoryId; readonly name?: string },
  deps: AtlasDeps,
): Promise<AtlasResult & { readonly shared: SharedLocation }> {
  const shared = parseSharedLocation(input.text)
  const categoryId = input.categoryId

  // A `geo:` URI or a pasted pair of numbers carries a point and no name at
  // all, so the form's name wins where there is one. Something has to ask
  // for a category regardless, which is why there is a form to ask in.
  const name = (input.name ?? shared.name ?? '').trim()
  if (name === '') {
    return { error: 'Nothing in that share looked like a place.', shared }
  }

  if (shared.coordinates !== undefined) {
    const waiting = unresolvedNamed(await deps.places.all(), name)
    if (waiting !== undefined) {
      const placed = await editPlace(
        waiting.id,
        {
          latitude: shared.coordinates.latitude,
          longitude: shared.coordinates.longitude,
          ...(shared.url === undefined ? {} : { website: shared.url }),
        },
        deps,
      )
      return { ...placed, shared }
    }
  }

  const result = await addPlace(
    {
      name,
      categoryId,
      ...(shared.coordinates === undefined
        ? {}
        : {
            latitude: shared.coordinates.latitude,
            longitude: shared.coordinates.longitude,
          }),
      ...(shared.url === undefined ? {} : { website: shared.url }),
    },
    deps,
  )

  return { ...result, shared }
}

export interface AtlasView {
  readonly places: readonly Place[]
  /** Walked plus visited, with duplicates collapsed. */
  readonly cells: ReadonlySet<CellId>
  readonly cellCount: number
  readonly areaKm2: number
}

export async function atlasView(deps: AtlasDeps): Promise<AtlasView> {
  const [places, walked] = await Promise.all([deps.places.all(), deps.explored.all()])
  const cells = allExploredCells(walked, places)
  const summary = summarizeExploration(cells)

  return { places, cells, cellCount: summary.cellCount, areaKm2: summary.areaKm2 }
}

/**
 * A reading from the device, turned into revealed ground.
 *
 * The accuracy gate is the load-bearing part. A fix accurate to half a
 * kilometre says nothing about which 150-metre square you are standing in,
 * and letting one through clears fog nobody walked — which cannot be
 * undone, because there is no such thing as un-walking ground.
 *
 * Returns how many cells were genuinely new so a caller can skip a write
 * and a re-render, which on a walk is most readings.
 */
export async function recordPosition(
  coordinates: Coordinates,
  accuracyMeters: number,
  deps: AtlasDeps,
): Promise<number> {
  const known = await deps.explored.all()
  const next = revealCell(known, coordinates, accuracyMeters)
  if (next === known) return 0

  return deps.explored.reveal([toCellId(coordinates)])
}

/**
 * Places saved by name that still have no point on the map.
 *
 * The pile the paste path creates on purpose: a name is enough to save
 * somewhere, and a coordinate can wait. What this is for is working
 * through that pile deliberately rather than discovering it as gaps on
 * the map.
 *
 * Oldest first — something that has been sitting unplaced for a month is
 * more likely to be the thing you meant to deal with than what you typed
 * this morning.
 */
export async function unplacedPlaces(deps: AtlasDeps): Promise<readonly Place[]> {
  const places = await deps.places.all()
  return places
    .filter((place) => !isResolved(place))
    .sort((a, b) => a.dateAdded.localeCompare(b.dateAdded))
}

/**
 * Gives an unplaced place a point, from a link, a pair of coordinates, or
 * the device.
 *
 * The parse is the same one the share target uses, so anything that can be
 * shared in can also be pasted here — and neither path touches the
 * network.
 */
export async function placeFromText(
  id: PlaceId,
  text: string,
  deps: AtlasDeps,
): Promise<AtlasResult> {
  const shared = parseSharedLocation(text)
  if (shared.coordinates === undefined) {
    return {
      error: shared.needsRedirect
        ? 'That short link only resolves on a server, so there is no point in it to read.'
        : 'No coordinates in that.',
    }
  }

  return editPlace(
    id,
    {
      latitude: shared.coordinates.latitude,
      longitude: shared.coordinates.longitude,
      ...(shared.url === undefined ? {} : { website: shared.url }),
    },
    deps,
  )
}
