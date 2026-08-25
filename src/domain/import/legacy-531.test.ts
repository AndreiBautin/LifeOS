import { describe, expect, it } from 'vitest'

import fixture from '@/test/fixtures/legacy-531-export.json'

import { parseLegacyMaxes } from './legacy-531'

/**
 * Tested against the real export rather than a hand-written sample.
 *
 * The decoding table was derived from this one file, so a synthetic
 * fixture would only prove the parser agrees with the assumptions used to
 * write it. The file carries independent ground truth — the training
 * maxes each cycle records — and those are what the numbers are checked
 * against.
 */

const maxes = parseLegacyMaxes(fixture)
const forLift = (id: string) => maxes.find((max) => max.exerciseId === id)

describe('reading maxes out of the export', () => {
  it('finds one estimate for each lift that was trained', () => {
    expect(maxes.map((max) => max.exerciseId)).toEqual([
      'bench-press',
      'low-bar-squat',
      'overhead-press',
      'sumo-deadlift',
    ])
  })

  it('produces estimates consistent with the training maxes the file records', () => {
    // A training max is 90% of a working max, so an estimate should land
    // a little above the highest training max the file ever held. Those
    // were 225.5 bench, 294 squat, 357.6 deadlift, 149 press.
    expect(forLift('bench-press')?.estimatedMax).toBeGreaterThan(225)
    expect(forLift('low-bar-squat')?.estimatedMax).toBeGreaterThan(294)
    expect(forLift('sumo-deadlift')?.estimatedMax).toBeGreaterThan(357)
    expect(forLift('overhead-press')?.estimatedMax).toBeGreaterThan(149)
  })

  it('shows the set each estimate came from', () => {
    // The number is a derived quantity, so the evidence travels with it —
    // "368 from 315 × 5" can be judged; "368" has to be taken on trust.
    const deadlift = forLift('sumo-deadlift')

    expect(deadlift?.fromLoad).toBe(315)
    expect(deadlift?.fromReps).toBe(5)
    expect(deadlift?.onDate).toBe('2026-06-18')
  })

  it('rounds, rather than carrying false precision', () => {
    for (const max of maxes) {
      expect(Number.isInteger(max.estimatedMax)).toBe(true)
    }
  })
})

describe('what it refuses to count', () => {
  it('ignores sessions that were never completed', () => {
    // The export stores its whole future schedule in the same array as
    // its past, with identical set structure. Counting those would derive
    // a max from training that has not happened.
    const future = parseLegacyMaxes({
      program: {
        '1': [
          {
            '7': [
              // No completion timestamp: scheduled, not performed.
              { '1': '2027-01-01', '3': [{ '1': 3, '2': 1, '13': 600, '4': 1, '5': 1 }] },
            ],
          },
        ],
      },
    })

    expect(future).toEqual([])
  })

  it('ignores warm-ups and sets that were not completed', () => {
    const result = parseLegacyMaxes({
      program: {
        '1': [
          {
            '7': [
              {
                '1': '2026-01-01',
                '8': '2026-01-01T10:00:00',
                '3': [
                  { '1': 3, '2': 5, '13': 500, '4': 0, '5': 1 }, // warm-up
                  { '1': 3, '2': 5, '13': 495, '4': 1, '5': 3 }, // skipped
                  { '1': 3, '2': 5, '13': 315, '4': 1, '5': 1 }, // the only real set
                ],
              },
            ],
          },
        ],
      },
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.fromLoad).toBe(315)
  })

  it('ignores rep counts the formulas cannot speak to', () => {
    // A set of twenty says more about work capacity than about a max.
    const result = parseLegacyMaxes({
      program: {
        '1': [
          {
            '7': [
              {
                '1': '2026-01-01',
                '8': '2026-01-01T10:00:00',
                '3': [{ '1': 3, '2': 20, '13': 315, '4': 1, '5': 1 }],
              },
            ],
          },
        ],
      },
    })

    expect(result).toEqual([])
  })

  it('survives a file that is not an export at all', () => {
    // The trust boundary. Anything can be dropped on a file picker.
    for (const junk of [null, undefined, 42, 'text', [], {}, { program: 'no' }]) {
      expect(parseLegacyMaxes(junk)).toEqual([])
    }
  })
})
