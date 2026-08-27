import { describe, expect, it } from 'vitest'
import type { CategoryId } from '@/domain/atlas/category/CategoryDefinition'
import type { CellId } from '@/domain/atlas/exploration/GeoCell'
import { toCellId } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'
import type { Place } from '@/domain/atlas/place/Place'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import {
  allExploredCells,
  cellsFromVisitedPlaces,
  exploredBounds,
  formatArea,
  revealCell,
  summarizeExploration,
} from './exploration'

const now = new Date('2026-01-01T00:00:00.000Z')
const OAKLAND: Coordinates = { latitude: 37.8, longitude: -122.27 }
const LONDON: Coordinates = { latitude: 51.5074, longitude: -0.1278 }

function place(id: string, coordinates: Coordinates | undefined, visited: boolean): Place {
  return {
    id: id as PlaceId,
    name: id,
    categoryId: 'coffee' as CategoryId,
    status: visited ? 'visited' : 'saved',
    priority: 'medium',
    location: coordinates === undefined ? {} : { coordinates },
    tags: [],
    favorite: false,
    dateAdded: now.toISOString(),
    ...(visited ? { dateVisited: now.toISOString() } : {}),
  }
}

describe('cellsFromVisitedPlaces', () => {
  it('reveals a cell for each visited place', () => {
    const cells = cellsFromVisitedPlaces([place('a', OAKLAND, true), place('b', LONDON, true)])

    expect(cells.size).toBe(2)
    expect(cells.has(toCellId(OAKLAND))).toBe(true)
  })

  it('ignores places that have not been visited', () => {
    expect(cellsFromVisitedPlaces([place('a', OAKLAND, false)]).size).toBe(0)
  })

  it('ignores places with no location', () => {
    expect(cellsFromVisitedPlaces([place('a', undefined, true)]).size).toBe(0)
  })

  it('collapses two visited places in the same cell', () => {
    const nextDoor = {
      latitude: OAKLAND.latitude + 0.00001,
      longitude: OAKLAND.longitude,
    }
    const cells = cellsFromVisitedPlaces([place('a', OAKLAND, true), place('b', nextDoor, true)])

    expect(cells.size).toBe(toCellId(nextDoor) === toCellId(OAKLAND) ? 1 : 2)
  })
})

describe('revealCell', () => {
  it('adds the cell the reading falls in', () => {
    const result = revealCell(new Set<CellId>(), OAKLAND, 10)

    expect(result.has(toCellId(OAKLAND))).toBe(true)
  })

  it('refuses a reading too vague to place you in a cell', () => {
    const before = new Set<CellId>()

    const result = revealCell(before, OAKLAND, 500)

    expect(result).toBe(before)
    expect(result.size).toBe(0)
  })

  it('returns the very same set when the cell is already known', () => {
    const before = revealCell(new Set<CellId>(), OAKLAND, 10)

    // Identity, not just equality: callers skip work when nothing changed.
    expect(revealCell(before, OAKLAND, 10)).toBe(before)
  })

  it('does not mutate the set it was given', () => {
    const before = new Set<CellId>()

    revealCell(before, OAKLAND, 10)

    expect(before.size).toBe(0)
  })
})

describe('allExploredCells', () => {
  it('merges walked cells with those of visited places', () => {
    const walked = new Set<CellId>([toCellId(LONDON)])

    const all = allExploredCells(walked, [place('a', OAKLAND, true)])

    expect(all.has(toCellId(LONDON))).toBe(true)
    expect(all.has(toCellId(OAKLAND))).toBe(true)
    expect(all.size).toBe(2)
  })

  it('counts a cell once when both walked and visited', () => {
    const walked = new Set<CellId>([toCellId(OAKLAND)])

    expect(allExploredCells(walked, [place('a', OAKLAND, true)]).size).toBe(1)
  })
})

describe('exploredBounds', () => {
  it('gives one rectangle per cell', () => {
    const cells = new Set<CellId>([toCellId(OAKLAND), toCellId(LONDON)])

    const bounds = exploredBounds(cells)

    expect(bounds).toHaveLength(2)
    expect(bounds.every((b) => b.north > b.south && b.east > b.west)).toBe(true)
  })
})

describe('summarizeExploration', () => {
  it('counts cells and sums their area', () => {
    const summary = summarizeExploration(new Set<CellId>([toCellId(OAKLAND), toCellId(LONDON)]))

    expect(summary.cellCount).toBe(2)
    expect(summary.areaKm2).toBeGreaterThan(0)
  })

  it('is zero for an untouched map', () => {
    expect(summarizeExploration(new Set<CellId>())).toEqual({
      cellCount: 0,
      areaKm2: 0,
    })
  })
})

describe('formatArea', () => {
  it('keeps two decimals below a square kilometre', () => {
    expect(formatArea(0.234)).toBe('0.23 km²')
  })

  it('keeps one decimal above it', () => {
    expect(formatArea(12.34)).toBe('12.3 km²')
  })
})
