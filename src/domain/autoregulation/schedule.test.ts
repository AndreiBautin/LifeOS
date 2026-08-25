import { describe, expect, it } from 'vitest'

import type { WorkoutLog } from '@/domain/logging/workout-log'
import { aWorkout } from '@/test/builders/workout'

import {
  DEFAULT_WEEKS_BEFORE_DELOAD,
  MAX_DAYS_PER_WEEK,
  MIN_DAYS_PER_WEEK,
  proposeDeload,
  proposeFrequency,
  type BlockPerformance,
} from './schedule'

/** A completed session of a given length. */
function session(minutes: number, date = '2026-08-24'): WorkoutLog {
  const start = new Date(`${date}T16:00:00.000Z`)
  const end = new Date(start.getTime() + minutes * 60_000)

  return aWorkout({
    date,
    status: 'completed',
    startedAt: start.toISOString(),
    completedAt: end.toISOString(),
  })
}

describe('frequency from session length', () => {
  it('holds when sessions sit in the productive band', () => {
    // Andrei's recent eight sessions average about 62 minutes, which is
    // exactly the case that should not move.
    const proposal = proposeFrequency([session(62), session(59), session(68), session(75)], 4)

    expect(proposal.adjustment).toBe('hold')
    expect(proposal.averageMinutes).toBeGreaterThan(60)
  })

  it('adds a day when sessions consistently run past two hours', () => {
    const proposal = proposeFrequency([session(135), session(128), session(140)], 4)

    expect(proposal.adjustment).toBe('add-day')
    expect(proposal.proposedDays).toBe(5)
  })

  it('removes a day when sessions are consistently short', () => {
    const proposal = proposeFrequency([session(28), session(24), session(31)], 5)

    expect(proposal.adjustment).toBe('remove-day')
    expect(proposal.proposedDays).toBe(4)
  })

  it('holds at a tight session rather than consolidating it away', () => {
    // Fifty-five minutes is what the default five-day week averages. A
    // floor that recommended consolidating it would have the app argue
    // against its own default every week.
    const proposal = proposeFrequency([session(52), session(58), session(55)], 5)

    expect(proposal.adjustment).toBe('hold')
  })

  it('refuses to exceed six days and says the volume is the problem', () => {
    const long = [session(150), session(145), session(155)]
    const proposal = proposeFrequency(long, MAX_DAYS_PER_WEEK)

    // The bound is the diagnosis. Needing a seventh day means the weekly
    // volume is more than a week can hold.
    expect(proposal.adjustment).toBe('hold')
    expect(proposal.blocked).toBe(true)
    expect(proposal.reason).toMatch(/total volume, not how it is split/)
  })

  it('refuses to drop below two days and says the opposite', () => {
    const short = [session(30), session(28), session(33)]
    const proposal = proposeFrequency(short, MIN_DAYS_PER_WEEK)

    expect(proposal.blocked).toBe(true)
    expect(proposal.reason).toMatch(/under-training/)
  })

  it('waits for enough evidence before moving', () => {
    expect(proposeFrequency([session(150), session(145)], 4).adjustment).toBe('hold')
  })

  it('ignores mis-tapped three-minute sessions', () => {
    const proposal = proposeFrequency(
      [session(2), session(1), session(130), session(140), session(135)],
      4,
    )

    expect(proposal.sampleSize).toBe(3)
    expect(proposal.adjustment).toBe('add-day')
  })

  it('ignores sessions that were never finished', () => {
    const open = aWorkout({ status: 'in-progress' })
    const proposal = proposeFrequency([open, session(130), session(140), session(135)], 4)

    expect(proposal.sampleSize).toBe(3)
  })
})

describe('deload timing', () => {
  const base: BlockPerformance = {
    weeksCompleted: 3,
    plannedWeeks: DEFAULT_WEEKS_BEFORE_DELOAD,
    regressedSessions: 0,
    totalSessions: 12,
    musclesFlaggingOverreach: 0,
    systemicRatio: 0.6,
  }

  it('holds mid-block when fatigue is tracking normally', () => {
    const proposal = proposeDeload(base)

    expect(proposal.shouldDeloadNow).toBe(false)
    expect(proposal.reason).toMatch(/Week 4 of 6/)
  })

  it('deloads when the planned weeks are done', () => {
    expect(proposeDeload({ ...base, weeksCompleted: 6 }).shouldDeloadNow).toBe(true)
  })

  it('pulls the deload forward when performance is falling apart', () => {
    const proposal = proposeDeload({
      ...base,
      weeksCompleted: 5,
      regressedSessions: 6,
      totalSessions: 12,
      systemicRatio: 1.2,
    })

    expect(proposal.shouldDeloadNow).toBe(true)
    expect(proposal.proposedWeeks).toBe(5)
    expect(proposal.blocked).toBe(false)
  })

  it('flags rather than shortening the block below four weeks', () => {
    const proposal = proposeDeload({
      ...base,
      weeksCompleted: 3,
      regressedSessions: 8,
      totalSessions: 12,
      musclesFlaggingOverreach: 4,
      systemicRatio: 1.3,
    })

    // Still take the deload — the body is asking. But the planned length
    // must not move, because the cause is the volume, not the calendar.
    expect(proposal.shouldDeloadNow).toBe(true)
    expect(proposal.blocked).toBe(true)
    expect(proposal.proposedWeeks).toBe(DEFAULT_WEEKS_BEFORE_DELOAD)
    expect(proposal.reason).toMatch(/below the 4-week floor/)
  })

  it('extends the next block when a lifter finishes fresh', () => {
    const proposal = proposeDeload({
      ...base,
      weeksCompleted: 6,
      regressedSessions: 0,
      systemicRatio: 0.4,
    })

    expect(proposal.proposedWeeks).toBe(7)
    expect(proposal.blocked).toBe(false)
  })

  it('flags rather than extending past eight weeks', () => {
    const proposal = proposeDeload({
      ...base,
      plannedWeeks: 8,
      weeksCompleted: 8,
      regressedSessions: 0,
      systemicRatio: 0.3,
    })

    expect(proposal.blocked).toBe(true)
    expect(proposal.proposedWeeks).toBe(8)
    expect(proposal.reason).toMatch(/volume is likely too low/)
  })
})
