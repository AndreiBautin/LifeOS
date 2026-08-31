import { describe, expect, it } from 'vitest'

import { averageOf, isPlausible, recordDay, recordedCount, type DayReading } from './day-reading'

describe('recording a day', () => {
  /*
   * The load-bearing one. Sleep is entered in the morning and macros at
   * night, so a write that mentioned only one must not blank the other —
   * the rule recordFinance already follows, because there is no telling
   * "I did not check" from "I meant zero" once it is stored.
   */
  it('leaves alone anything the change does not mention', () => {
    const morning = recordDay(undefined, '2026-08-31', { sleepHours: 7.5 })
    const night = recordDay(morning, '2026-08-31', { calories: 2400, proteinGrams: 180 })

    expect(night.sleepHours).toBe(7.5)
    expect(night.calories).toBe(2400)
  })

  /*
   * Clearing is a separate word. A call site must not be able to ask for
   * "fill in what I know" and receive "wipe the rest".
   */
  it('clears a figure only when told to, with null', () => {
    const day = recordDay(undefined, '2026-08-31', { sleepHours: 7.5, calories: 2400 })
    const cleared = recordDay(day, '2026-08-31', { sleepHours: null })

    expect(cleared.sleepHours).toBeUndefined()
    expect(cleared.calories).toBe(2400)
  })

  it('returns the same object when nothing moved, so nothing is written', () => {
    const day = recordDay(undefined, '2026-08-31', { sleepHours: 7.5 })

    expect(recordDay(day, '2026-08-31', { sleepHours: 7.5 })).toBe(day)
    expect(recordDay(day, '2026-08-31', {})).toBe(day)
  })

  /*
   * Refused rather than clamped, the rule the credit score follows.
   * Rounding a typo into range would put a figure nobody produced into a
   * series, and the series is the only thing here that has to be
   * trustworthy.
   */
  it('refuses an implausible figure instead of reshaping it', () => {
    const day = recordDay(undefined, '2026-08-31', { sleepHours: 800 })

    expect(day.sleepHours).toBeUndefined()
    expect(isPlausible('sleepHours', 800)).toBe(false)
    expect(isPlausible('sleepHours', 7.5)).toBe(true)
  })

  it('keeps zero, which is a real answer for calories and for sleep', () => {
    const day = recordDay(undefined, '2026-08-31', { calories: 0 })

    expect(day.calories).toBe(0)
  })
})

describe('reading a stretch of days back', () => {
  const days: readonly DayReading[] = [
    { day: '2026-08-29', sleepHours: 7 },
    { day: '2026-08-30' },
    { day: '2026-08-31', sleepHours: 8, calories: 2400 },
  ]

  /*
   * Absent, never zero. A day with nothing recorded is skipped rather
   * than counted as a night of no sleep — folding it in would report a
   * catastrophe that did not happen.
   */
  it('averages only the days that have the figure', () => {
    expect(averageOf(days, 'sleepHours')).toBe(7.5)
    expect(recordedCount(days, 'sleepHours')).toBe(2)
  })

  it('says nothing about a figure nobody has recorded', () => {
    expect(averageOf(days, 'fatGrams')).toBeUndefined()
    expect(averageOf([], 'sleepHours')).toBeUndefined()
  })
})
