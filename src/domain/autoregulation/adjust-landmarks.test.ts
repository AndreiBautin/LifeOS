import { describe, expect, it } from 'vitest'

import { DEFAULT_LANDMARKS, validateLandmarks } from '@/domain/volume/landmarks'
import {
  aPostCheckIn,
  aPreCheckIn,
  GOOD_READINESS,
  NEUTRAL_READINESS,
  POOR_READINESS,
} from '@/test/builders/workout'

import { sessionAdjustmentFor, unrecoveredMuscles } from './check-in'
import {
  applyProposals,
  MINIMUM_OBSERVATIONS,
  proposeLandmarkAdjustments,
} from './adjust-landmarks'

describe('landmark proposals require evidence', () => {
  it('ignores a single report of soreness', () => {
    // StrengthFlow cut a muscle's volume on the first answer, so one bad
    // week permanently reshaped the program. One data point is noise.
    const proposals = proposeLandmarkAdjustments(DEFAULT_LANDMARKS, [
      aPreCheckIn({ chest: 'not-recovered' }),
    ])

    expect(proposals).toEqual([])
  })

  it('fires once the same signal repeats across enough sessions', () => {
    const checkIns = Array.from({ length: MINIMUM_OBSERVATIONS }, () =>
      aPreCheckIn({ chest: 'not-recovered' }),
    )

    const proposals = proposeLandmarkAdjustments(DEFAULT_LANDMARKS, checkIns)
    const chest = proposals.find((proposal) => proposal.muscle === 'chest')

    expect(chest).toBeDefined()
    expect(chest?.deltaMav).toBeLessThan(0)
    expect(chest?.observations).toBe(MINIMUM_OBSERVATIONS)
  })

  it('averages rather than accumulating, so a mixed run does not move', () => {
    const proposals = proposeLandmarkAdjustments(DEFAULT_LANDMARKS, [
      aPreCheckIn({ chest: 'not-recovered' }),
      aPreCheckIn({ chest: 'recovered-early' }),
      aPreCheckIn({ chest: 'recovered-on-time' }),
      aPreCheckIn({ chest: 'recovered-on-time' }),
    ])

    expect(proposals.find((proposal) => proposal.muscle === 'chest')).toBeUndefined()
  })

  it('does not let a frequently-trained muscle move faster than a rare one', () => {
    const many = Array.from({ length: 12 }, () => aPreCheckIn({ chest: 'recovered-early' }))
    const few = Array.from({ length: 3 }, () => aPreCheckIn({ calves: 'recovered-early' }))

    const proposals = proposeLandmarkAdjustments(DEFAULT_LANDMARKS, [...many, ...few])
    const chest = proposals.find((proposal) => proposal.muscle === 'chest')
    const calves = proposals.find((proposal) => proposal.muscle === 'calves')

    expect(chest?.deltaMav).toBe(calves?.deltaMav)
  })
})

describe('proposals stay inside the recoverable band', () => {
  it('never pushes the adaptive target below the minimum effective volume', () => {
    const stubborn = Array.from({ length: 40 }, () => aPostCheckIn({ chest: 'too-much' }))

    let landmarks = DEFAULT_LANDMARKS
    // Applied repeatedly, the way a lifter reporting the same thing for
    // months would. StrengthFlow's counter walked to zero here.
    for (let round = 0; round < 20; round += 1) {
      landmarks = applyProposals(landmarks, proposeLandmarkAdjustments(landmarks, stubborn))
    }

    expect(landmarks.chest.mav).toBeGreaterThanOrEqual(landmarks.chest.mev)
    expect(() => {
      validateLandmarks(landmarks.chest, 'chest')
    }).not.toThrow()
  })

  it('keeps the ordering MV ≤ MEV ≤ MAV ≤ MRV under sustained pressure in both directions', () => {
    const easy = Array.from({ length: 6 }, () => aPostCheckIn({ biceps: 'easy' }))
    const hard = Array.from({ length: 6 }, () => aPostCheckIn({ triceps: 'too-much' }))

    let landmarks = DEFAULT_LANDMARKS
    for (let round = 0; round < 15; round += 1) {
      landmarks = applyProposals(
        landmarks,
        proposeLandmarkAdjustments(landmarks, [...easy, ...hard]),
      )
    }

    for (const muscle of ['biceps', 'triceps'] as const) {
      expect(() => {
        validateLandmarks(landmarks[muscle], muscle)
      }).not.toThrow()
    }
  })

  it('raises the ceiling when a lifter keeps recovering early at their maximum', () => {
    const easy = Array.from({ length: 6 }, () => aPostCheckIn({ calves: 'easy' }))

    // Start with the adaptive target already at the ceiling.
    const atCeiling = {
      ...DEFAULT_LANDMARKS,
      calves: { ...DEFAULT_LANDMARKS.calves, mav: DEFAULT_LANDMARKS.calves.mrv },
    }

    const proposals = proposeLandmarkAdjustments(atCeiling, easy)
    const calves = proposals.find((proposal) => proposal.muscle === 'calves')

    expect(calves?.proposed.mrv).toBeGreaterThan(atCeiling.calves.mrv)
  })

  it('never moves the minimum effective volume', () => {
    const checkIns = Array.from({ length: 8 }, () => aPostCheckIn({ quads: 'easy' }))
    const proposals = proposeLandmarkAdjustments(DEFAULT_LANDMARKS, checkIns)
    const quads = proposals.find((proposal) => proposal.muscle === 'quads')

    // Soreness ratings say nothing about the least volume that produces
    // growth, so MEV is not something a check-in is allowed to move.
    expect(quads?.proposed.mev).toBe(DEFAULT_LANDMARKS.quads.mev)
  })
})

describe('proposals are explained and reversible', () => {
  it('names the muscle, the direction and the evidence', () => {
    const proposals = proposeLandmarkAdjustments(
      DEFAULT_LANDMARKS,
      Array.from({ length: 4 }, () => aPostCheckIn({ lats: 'easy' })),
    )

    const lats = proposals.find((proposal) => proposal.muscle === 'lats')
    expect(lats?.reason).toContain('lats')
    expect(lats?.reason).toContain('4 sessions')
    expect(lats?.reason).toMatch(/room for/)
  })

  it('leaves every muscle untouched when nothing is accepted', () => {
    const proposals = proposeLandmarkAdjustments(
      DEFAULT_LANDMARKS,
      Array.from({ length: 5 }, () => aPostCheckIn({ chest: 'too-much' })),
    )

    expect(proposals.length).toBeGreaterThan(0)
    expect(applyProposals(DEFAULT_LANDMARKS, [])).toBe(DEFAULT_LANDMARKS)
  })

  it('applies only the proposals accepted', () => {
    const proposals = proposeLandmarkAdjustments(DEFAULT_LANDMARKS, [
      ...Array.from({ length: 4 }, () => aPostCheckIn({ chest: 'too-much' })),
      ...Array.from({ length: 4 }, () => aPostCheckIn({ lats: 'easy' })),
    ])

    const chestOnly = proposals.filter((proposal) => proposal.muscle === 'chest')
    const applied = applyProposals(DEFAULT_LANDMARKS, chestOnly)

    expect(applied.chest.mav).not.toBe(DEFAULT_LANDMARKS.chest.mav)
    expect(applied.lats).toEqual(DEFAULT_LANDMARKS.lats)
  })
})

describe('readiness affects today, not the landmarks', () => {
  it('trims a session when several factors are poor', () => {
    const adjustment = sessionAdjustmentFor(POOR_READINESS)

    expect(adjustment.setMultiplier).toBeLessThan(1)
    expect(adjustment.reason).toMatch(/Readiness is low/)
  })

  it('leaves a normal day exactly as programmed', () => {
    expect(sessionAdjustmentFor(NEUTRAL_READINESS).setMultiplier).toBe(1)
  })

  it('offers a little more on a good day', () => {
    expect(sessionAdjustmentFor(GOOD_READINESS).setMultiplier).toBeGreaterThan(1)
  })

  it('produces no landmark proposal at all', () => {
    // A bad night's sleep is a reason to cut today, not evidence that a
    // muscle's weekly tolerance changed. StrengthFlow ran both signals
    // through the same code path, so poor sleep permanently shrank the
    // program.
    const checkIns = Array.from({ length: 10 }, () => aPreCheckIn({}, POOR_READINESS))

    expect(proposeLandmarkAdjustments(DEFAULT_LANDMARKS, checkIns)).toEqual([])
  })
})

describe('unrecovered muscles', () => {
  it('lists only those reported as still sore', () => {
    const checkIn = aPreCheckIn({
      chest: 'not-recovered',
      triceps: 'recovered-on-time',
      lats: 'not-recovered',
    })

    expect([...unrecoveredMuscles(checkIn)].sort()).toEqual(['chest', 'lats'])
  })
})
