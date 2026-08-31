import { describe, expect, it } from 'vitest'

import type { DayReading } from './day-reading'
import { cutReading, dayStanding, SLEEP_HOURS, sleepStanding } from './day-standing'

const days: readonly DayReading[] = [
  { day: '2026-08-29', sleepHours: 6, proteinGrams: 150, calories: 2400 },
  { day: '2026-08-30', sleepHours: 6, proteinGrams: 170, calories: 2600 },
  { day: '2026-08-31' },
]

describe('judging sleep against published guidance', () => {
  /*
   * Sleep gets a verdict because somebody outside this app published the
   * bands, which is the same reason the credit score is a ladder and net
   * worth is not.
   */
  it('reads the bands the guidance actually states', () => {
    expect(sleepStanding(SLEEP_HOURS.enough - 0.1)).toBe('short')
    expect(sleepStanding(SLEEP_HOURS.enough)).toBe('enough')
    expect(sleepStanding(SLEEP_HOURS.ample)).toBe('enough')
    expect(sleepStanding(SLEEP_HOURS.ample + 0.1)).toBe('ample')
  })
})

describe('what the recorded days say', () => {
  it('averages only the days that carry each figure', () => {
    const standing = dayStanding(days, 180)

    expect(standing.sleep?.average).toBe(6)
    expect(standing.sleep?.days).toBe(2)
    expect(standing.calories?.average).toBe(2500)
  })

  it('judges protein against the target the app already derives', () => {
    expect(dayStanding(days, 180).protein?.met).toBe(false)
    expect(dayStanding(days, 150).protein?.met).toBe(true)
  })

  /*
   * Without a bodyweight there is no target, and "160 g" against nothing
   * is a number with no question attached.
   */
  it('says nothing about protein when there is no target', () => {
    expect(dayStanding(days, undefined).protein).toBeUndefined()
  })

  /*
   * Calories are reported and never judged. There is no published figure
   * at which somebody has eaten correctly — it depends on the person and
   * the phase — so this is net worth's footing, not the credit score's.
   */
  it('reports calories without a verdict attached', () => {
    const calories = dayStanding(days, 180).calories

    expect(calories?.average).toBe(2500)
    expect(calories).not.toHaveProperty('met')
    expect(calories).not.toHaveProperty('standing')
  })

  it('says nothing at all about a fortnight nobody recorded', () => {
    const empty = dayStanding([{ day: '2026-08-31' }], 180)

    expect(empty.sleep).toBeUndefined()
    expect(empty.protein).toBeUndefined()
    expect(empty.calories).toBeUndefined()
  })
})

describe('what the cut is running on', () => {
  it('sets the rate beside the intake that produced it', () => {
    const reading = cutReading(-0.6, dayStanding(days, 180))

    expect(reading?.ratePerWeek).toBe(-0.6)
    expect(reading?.calories).toBe(2500)
    expect(reading?.days).toBe(2)
  })

  /*
   * Half of it is not a sentence. Both halves are measurements and the
   * whole point is setting them side by side.
   */
  it('says nothing without both halves', () => {
    expect(cutReading(undefined, dayStanding(days, 180))).toBeUndefined()
    expect(cutReading(-0.6, dayStanding([{ day: '2026-08-31' }], 180))).toBeUndefined()
  })
})
