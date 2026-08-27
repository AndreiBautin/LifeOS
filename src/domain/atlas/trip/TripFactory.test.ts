import { describe, expect, it } from 'vitest'
import { createPlaceId } from '../place/PlaceId'
import { isErr, isOk } from '../shared/Result'
import { addPlaceToTrip, createTrip, removePlaceFromTrip, updateTrip } from './TripFactory'
import type { CreateTripInput } from './TripFactory'
import { createTripId } from './TripId'

const tripIdResult = createTripId('trip-1')
if (!tripIdResult.ok) throw new Error('unreachable: fixture id is valid')
const tripId = tripIdResult.value

const placeIdResult = createPlaceId('place-1')
if (!placeIdResult.ok) throw new Error('unreachable: fixture id is valid')
const placeId = placeIdResult.value

function validInput(overrides: Partial<CreateTripInput> = {}): CreateTripInput {
  return {
    id: tripId,
    name: 'California Trip 2027',
    location: 'California, USA',
    ...overrides,
  }
}

describe('createTrip', () => {
  it('creates a trip with no places and no dates by default', () => {
    const result = createTrip(validInput())

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.name).toBe('California Trip 2027')
      expect(result.value.location).toBe('California, USA')
      expect(result.value.placeIds).toEqual([])
      expect(result.value.startDate).toBeUndefined()
      expect(result.value.endDate).toBeUndefined()
    }
  })

  it('rejects an empty name', () => {
    const result = createTrip(validInput({ name: '  ' }))

    expect(isErr(result)).toBe(true)
  })

  it('rejects an end date before the start date', () => {
    const result = createTrip(
      validInput({
        startDate: '2027-06-10',
        endDate: '2027-06-01',
      }),
    )

    expect(isErr(result)).toBe(true)
  })

  it('accepts an end date on or after the start date', () => {
    const result = createTrip(
      validInput({
        startDate: '2027-06-01',
        endDate: '2027-06-10',
      }),
    )

    expect(isOk(result)).toBe(true)
  })
})

describe('updateTrip', () => {
  it('applies partial changes', () => {
    const created = createTrip(validInput())
    if (!created.ok) throw new Error('unreachable: fixture input is valid')

    const result = updateTrip(created.value, { notes: 'Book flights early' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.notes).toBe('Book flights early')
      expect(result.value.name).toBe('California Trip 2027')
    }
  })
})

describe('addPlaceToTrip / removePlaceFromTrip', () => {
  it('adds a place id without duplicating it', () => {
    const created = createTrip(validInput())
    if (!created.ok) throw new Error('unreachable: fixture input is valid')

    const withPlace = addPlaceToTrip(created.value, placeId)
    const withPlaceAgain = addPlaceToTrip(withPlace, placeId)

    expect(withPlace.placeIds).toEqual([placeId])
    expect(withPlaceAgain.placeIds).toEqual([placeId])
  })

  it('removes a place id', () => {
    const created = createTrip(validInput())
    if (!created.ok) throw new Error('unreachable: fixture input is valid')

    const withPlace = addPlaceToTrip(created.value, placeId)
    const withoutPlace = removePlaceFromTrip(withPlace, placeId)

    expect(withoutPlace.placeIds).toEqual([])
  })
})
