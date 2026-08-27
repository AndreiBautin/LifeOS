import { describe, expect, it } from 'vitest'
import { parseBulkCapture } from './ParseBulkCapture'

const namesOf = (text: string, options?: Parameters<typeof parseBulkCapture>[1]) =>
  parseBulkCapture(text, options).entries.map((entry) => entry.name)

describe('parseBulkCapture', () => {
  it('takes one place per line', () => {
    expect(namesOf('Blue Bottle\nTartine Bakery\nZuni Cafe')).toEqual([
      'Blue Bottle',
      'Tartine Bakery',
      'Zuni Cafe',
    ])
  })

  it('ignores blank and whitespace-only lines', () => {
    expect(namesOf('Blue Bottle\n\n   \n\nTartine')).toEqual(['Blue Bottle', 'Tartine'])
  })

  it('strips list markers pasted in from notes apps', () => {
    const text = ['- Blue Bottle', '* Tartine', '1. Zuni Cafe', '2) Swan Oyster', '• Nopa'].join(
      '\n',
    )

    expect(namesOf(text)).toEqual(['Blue Bottle', 'Tartine', 'Zuni Cafe', 'Swan Oyster', 'Nopa'])
  })

  it('collapses stray whitespace inside and around a name', () => {
    expect(namesOf('   Blue    Bottle   Coffee  ')).toEqual(['Blue Bottle Coffee'])
  })

  it('keeps a hyphenated name rather than treating the dash as a marker', () => {
    expect(namesOf('Jean-Georges\nCafé du Monde')).toEqual(['Jean-Georges', 'Café du Monde'])
  })

  it('reports the original line number so a rejected entry can be found', () => {
    const result = parseBulkCapture('\n\nBlue Bottle\n\nTartine')

    expect(result.entries).toEqual([
      { lineNumber: 3, name: 'Blue Bottle' },
      { lineNumber: 5, name: 'Tartine' },
    ])
  })

  it('drops duplicates within the paste, case-insensitively, and reports them', () => {
    const result = parseBulkCapture('Blue Bottle\nTartine\nblue bottle')

    expect(result.entries.map((e) => e.name)).toEqual(['Blue Bottle', 'Tartine'])
    expect(result.duplicates).toEqual(['blue bottle'])
  })

  it('drops names already saved and reports them separately from duplicates', () => {
    const result = parseBulkCapture('Blue Bottle\nTartine', {
      existingNames: ['  blue bottle  '],
    })

    expect(result.entries.map((e) => e.name)).toEqual(['Tartine'])
    expect(result.alreadySaved).toEqual(['Blue Bottle'])
    expect(result.duplicates).toEqual([])
  })

  it('rejects a name too long for the domain to accept', () => {
    const long = 'x'.repeat(201)
    const result = parseBulkCapture(`Blue Bottle\n${long}`)

    expect(result.entries.map((e) => e.name)).toEqual(['Blue Bottle'])
    expect(result.tooLong).toEqual([long])
  })

  it('caps the batch and reports how much was left out', () => {
    const text = Array.from({ length: 5 }, (_, i) => `Place ${String(i)}`).join('\n')

    const result = parseBulkCapture(text, { maxEntries: 3 })

    expect(result.entries).toHaveLength(3)
    expect(result.truncated).toBe(2)
  })

  it('does not count a duplicate against the cap', () => {
    const result = parseBulkCapture('A\nA\nB', { maxEntries: 2 })

    expect(result.entries.map((e) => e.name)).toEqual(['A', 'B'])
    expect(result.truncated).toBe(0)
  })

  it('handles Windows line endings', () => {
    expect(namesOf('Blue Bottle\r\nTartine')).toEqual(['Blue Bottle', 'Tartine'])
  })

  it('returns nothing for empty input', () => {
    const result = parseBulkCapture('   \n\n  ')

    expect(result.entries).toEqual([])
    expect(result.duplicates).toEqual([])
    expect(result.alreadySaved).toEqual([])
    expect(result.tooLong).toEqual([])
    expect(result.truncated).toBe(0)
  })
})
