import { describe, expect, it } from 'vitest'

import { describePrescription } from '@/domain/programs/prescription'

import {
  CANONICAL_531_WEEKS,
  DEFAULT_BBB,
  DEFAULT_TM_PROGRESSION,
  mainSetPrescriptions,
  supplementalPercent,
  supplementalPrescriptions,
  validateWeeks,
  type SupplementalConfig,
} from './five-three-one'

/**
 * These assertions are deliberately literal.
 *
 * The percentages are the program. If a refactor changes 85% to ８0%, no
 * type error and no integration test would catch it — the app would keep
 * working and would simply prescribe the wrong training. Writing them out
 * means the scheme itself is under test, not just the machinery that
 * carries it.
 */
describe('the canonical 5/3/1 cycle', () => {
  it('is four weeks long', () => {
    expect(CANONICAL_531_WEEKS).toHaveLength(4)
  })

  it.each([
    [0, 'Week 1 — 5s', [65, 75, 85], [5, 5, 5]],
    [1, 'Week 2 — 3s', [70, 80, 90], [3, 3, 3]],
    [2, 'Week 3 — 5/3/1', [75, 85, 95], [5, 3, 1]],
    [3, 'Week 4 — Deload', [40, 50, 60], [5, 5, 5]],
  ])('week %i (%s) prescribes %j percent for %j reps', (index, label, percents, reps) => {
    const week = CANONICAL_531_WEEKS[index]
    expect(week?.label).toBe(label)
    expect(week?.sets.map((set) => set.percent)).toEqual(percents)
    expect(week?.sets.map((set) => set.reps)).toEqual(reps)
  })

  it('takes the last set of each working week to failure, and none of the deload', () => {
    const amrapPerWeek = CANONICAL_531_WEEKS.map((week) => week.sets.map((set) => set.isAmrap))
    expect(amrapPerWeek).toEqual([
      [false, false, true],
      [false, false, true],
      [false, false, true],
      [false, false, false],
    ])
  })

  it('marks exactly one week as a deload', () => {
    expect(CANONICAL_531_WEEKS.filter((week) => week.isDeload)).toHaveLength(1)
    expect(CANONICAL_531_WEEKS[3]?.isDeload).toBe(true)
  })

  it('accepts its own definition as valid', () => {
    expect(() => {
      validateWeeks(CANONICAL_531_WEEKS)
    }).not.toThrow()
  })
})

describe('main set prescriptions', () => {
  it('renders week 1 the way a lifter reads it', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const sets = mainSetPrescriptions(week, { includeWarmups: false })

    expect(sets.map(describePrescription)).toEqual(['65% TM × 5', '75% TM × 5', '85% TM × 5+'])
  })

  it('renders week 3 as 5/3/1 with a single-rep AMRAP', () => {
    const week = CANONICAL_531_WEEKS[2]
    if (!week) throw new Error('missing week')

    const sets = mainSetPrescriptions(week, { includeWarmups: false })

    expect(sets.map(describePrescription)).toEqual(['75% TM × 5', '85% TM × 3', '95% TM × 1+'])
  })

  it('prepends warm-ups that are excluded from working volume', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const sets = mainSetPrescriptions(week, { includeWarmups: true })

    expect(sets).toHaveLength(6)
    expect(sets.filter((set) => set.isWarmup === true)).toHaveLength(3)
    expect(sets.slice(3).every((set) => set.isWarmup !== true)).toBe(true)
  })
})

describe('Boring But Big', () => {
  it('starts at 50% for five sets of ten', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const sets = supplementalPrescriptions(DEFAULT_BBB, week, 1)

    expect(sets).toHaveLength(5)
    expect(sets.every((set) => describePrescription(set) === '50% TM × 10')).toBe(true)
  })

  it('climbs 50 → 60 across cycles and then stops', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    const percents = [1, 2, 3, 4, 5, 6, 10].map((cycle) =>
      supplementalPercent(DEFAULT_BBB, week, cycle),
    )

    expect(percents).toEqual([50, 52.5, 55, 57.5, 60, 60, 60])
  })

  it('adds no supplemental work to a deload week', () => {
    const deload = CANONICAL_531_WEEKS[3]
    if (!deload) throw new Error('missing week')

    // Fifty hard reps appended to a deload is not a deload. Both old apps
    // reduced only set count on their light week and never intensity, so
    // this is the regression most worth pinning down.
    expect(supplementalPrescriptions(DEFAULT_BBB, deload, 1)).toEqual([])
  })
})

describe('First and Second Set Last', () => {
  const fsl: SupplementalConfig = { ...DEFAULT_BBB, style: 'fsl', sets: 5, reps: 5 }
  const ssl: SupplementalConfig = { ...DEFAULT_BBB, style: 'ssl', sets: 3, reps: 5 }

  it('tracks the wave without any percentage of its own', () => {
    const percentsByWeek = CANONICAL_531_WEEKS.map((week) => supplementalPercent(fsl, week, 1))
    expect(percentsByWeek).toEqual([65, 70, 75, 40])
  })

  it('reads the middle set for Second Set Last', () => {
    const percentsByWeek = CANONICAL_531_WEEKS.map((week) => supplementalPercent(ssl, week, 1))
    expect(percentsByWeek).toEqual([75, 80, 85, 50])
  })

  it('ignores the configured BBB percentage entirely', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    expect(supplementalPercent({ ...fsl, percent: 99 }, week, 1)).toBe(65)
  })
})

describe('no supplemental work', () => {
  it('produces nothing', () => {
    const week = CANONICAL_531_WEEKS[0]
    if (!week) throw new Error('missing week')

    expect(supplementalPercent({ ...DEFAULT_BBB, style: 'none' }, week, 1)).toBeUndefined()
    expect(supplementalPrescriptions({ ...DEFAULT_BBB, style: 'none' }, week, 1)).toEqual([])
  })
})

describe('training max progression defaults', () => {
  it('advances lower-body lifts twice as fast as upper', () => {
    expect(DEFAULT_TM_PROGRESSION.lowerIncrement).toBe(10)
    expect(DEFAULT_TM_PROGRESSION.upperIncrement).toBe(5)
  })

  it('resets to 90% rather than holding when an AMRAP is missed', () => {
    expect(DEFAULT_TM_PROGRESSION.resetToPercent).toBe(90)
  })
})

describe('week validation', () => {
  it('rejects a cycle with no weeks', () => {
    expect(() => {
      validateWeeks([])
    }).toThrow(/at least one week/)
  })

  it('rejects a week with no main sets', () => {
    expect(() => {
      validateWeeks([{ label: 'Empty', isDeload: false, sets: [] }])
    }).toThrow(/no main sets/)
  })

  it('rejects an impossible percentage', () => {
    expect(() => {
      validateWeeks([
        { label: 'Bad', isDeload: false, sets: [{ percent: 400, reps: 5, isAmrap: false }] },
      ])
    }).toThrow(/outside the supported range/)
  })
})
