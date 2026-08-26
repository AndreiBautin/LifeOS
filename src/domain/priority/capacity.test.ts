import { describe, expect, it } from 'vitest'

import type { MuscleGroup } from '@/domain/exercises/taxonomy'

import { shortfalls, type Delivered } from './capacity'

function delivered(entries: Record<string, number>): readonly Delivered[] {
  return Object.entries(entries).map(([muscle, total]) => ({
    muscle: muscle as MuscleGroup,
    label: muscle,
    total,
  }))
}

const asked = (targets: Record<string, number>) => (muscle: MuscleGroup) => targets[muscle] ?? 0

describe('what the week could not fit', () => {
  it('reports a muscle the program leaves short', () => {
    // The real case: side delts asked for 20, three upper days at the
    // per-session cap deliver 15, and no fourth session exists to fix it.
    const result = shortfalls(delivered({ 'side-delts': 15 }), asked({ 'side-delts': 20 }))

    expect(result).toEqual([
      { muscle: 'side-delts', label: 'side-delts', asked: 20, delivered: 15, short: 5 },
    ])
  })

  it('says nothing about a muscle that is met', () => {
    expect(shortfalls(delivered({ chest: 18 }), asked({ chest: 17 }))).toEqual([])
  })

  it('ignores a shortfall too small to act on', () => {
    // Credit is fractional — half a set for a secondary muscle, four
    // fifths for an RPE 8 set — so a tenth of a set below target is
    // arithmetic, not a problem. Listing it would bury the real ones.
    expect(shortfalls(delivered({ lats: 13.9 }), asked({ lats: 14 }))).toEqual([])
  })

  it('says nothing about a muscle nobody asked for', () => {
    // Maintenance muscles are paid entirely by the competition lifts. A
    // target of zero cannot be missed.
    expect(shortfalls(delivered({ glutes: 0 }), asked({ glutes: 0 }))).toEqual([])
  })

  it('puts the worst first, because that is the one to act on', () => {
    const result = shortfalls(
      delivered({ lats: 12.5, 'side-delts': 15, quads: 6 }),
      asked({ lats: 14, 'side-delts': 20, quads: 7 }),
    )

    expect(result.map((entry) => entry.muscle)).toEqual(['side-delts', 'lats', 'quads'])
  })

  it('never aggregates, because the total would reassure in the wrong direction', () => {
    /*
     * Every set pays two or three muscles, so delivered-across-all
     * comfortably exceeds asked-across-all even in a week that starves a
     * prioritised muscle. Here the totals are 40 delivered against 32
     * asked while the side delts are five short — a sum would report a
     * surplus. The shape of the return type is what prevents it.
     */
    const result = shortfalls(
      delivered({ 'side-delts': 15, chest: 25 }),
      asked({ 'side-delts': 20, chest: 12 }),
    )

    expect(result).toHaveLength(1)
    expect(result[0]?.muscle).toBe('side-delts')
  })
})
