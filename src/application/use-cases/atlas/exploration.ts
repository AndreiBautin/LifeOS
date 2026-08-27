import type { BoundingBox, CellId } from '@/domain/atlas/exploration/GeoCell'
import { cellAreaKm2, cellBounds, toCellId } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Place } from '@/domain/atlas/place/Place'
import { isResolved } from '@/domain/atlas/place/Place'

export interface ExplorationSummary {
  readonly cellCount: number
  readonly areaKm2: number
}

/**
 * Cells revealed by places you have actually been to.
 *
 * Derived, never stored: it is a pure function of the places, so it stays
 * right when a place is edited, deleted, or un-visited, with no second copy
 * of the truth to fall out of sync.
 */
export function cellsFromVisitedPlaces(places: readonly Place[]): Set<CellId> {
  const cells = new Set<CellId>()
  for (const place of places) {
    if (isResolved(place) && place.dateVisited !== undefined) {
      cells.add(toCellId(place.location.coordinates))
    }
  }
  return cells
}

/**
 * Adds the cell containing a reading, if it is trustworthy enough to count.
 *
 * A fix accurate to half a kilometre says nothing about which 150m square you
 * are standing in, and letting one through would clear fog you never walked.
 * Returns the same set when nothing changed, so callers can skip a re-render.
 */
export function revealCell(
  explored: ReadonlySet<CellId>,
  coordinates: Coordinates,
  accuracyMeters: number,
  maxAccuracyMeters = 100,
): ReadonlySet<CellId> {
  if (accuracyMeters > maxAccuracyMeters) return explored

  const cell = toCellId(coordinates)
  if (explored.has(cell)) return explored

  const next = new Set(explored)
  next.add(cell)
  return next
}

/** Every revealed cell: walked plus visited, with duplicates collapsed. */
export function allExploredCells(
  walked: ReadonlySet<CellId>,
  places: readonly Place[],
): Set<CellId> {
  const cells = cellsFromVisitedPlaces(places)
  for (const cell of walked) {
    cells.add(cell)
  }
  return cells
}

/** The rectangles to punch out of the fog. */
export function exploredBounds(cells: ReadonlySet<CellId>): BoundingBox[] {
  return [...cells].map(cellBounds)
}

export function summarizeExploration(cells: ReadonlySet<CellId>): ExplorationSummary {
  let areaKm2 = 0
  for (const cell of cells) {
    areaKm2 += cellAreaKm2(cell)
  }
  return { cellCount: cells.size, areaKm2 }
}

/** "0.4 km²" reads better than six decimal places of nothing. */
export function formatArea(areaKm2: number): string {
  if (areaKm2 < 1) {
    return `${String(Math.round(areaKm2 * 100) / 100)} km²`
  }
  return `${String(Math.round(areaKm2 * 10) / 10)} km²`
}
