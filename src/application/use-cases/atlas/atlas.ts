import { toCellId, type CellId } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Place } from '@/domain/atlas/place/Place'
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
