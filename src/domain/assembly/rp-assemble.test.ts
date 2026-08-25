import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { asExerciseId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { ProgramTemplate, ProgramWeek } from '@/domain/programs/program'
import { DEFAULT_MUSCLE_TIERS, priorityPosition } from '@/domain/priority/tiers'
import { sumVolume, volumeForSlots } from '@/domain/volume/accounting'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import { assembleRpProgram, defaultRpRecipe, type RpRecipe } from './rp-assemble'

const exercises = builtInExercises()
const lookup = (id: string) => exercises.find((exercise) => exercise.id === id)

function counterIds(): IdGenerator {
  let n = 0
  return {
    next: () => {
      n += 1
      return `id-${String(n)}`
    },
  }
}

function build(overrides: Partial<RpRecipe> = {}): ProgramTemplate {
  return assembleRpProgram(defaultRpRecipe(overrides), asProgramId('rp'), {
    exercises,
    ids: counterIds(),
    now: new Date('2026-08-24T00:00:00Z'),
  })
}

function weekAt(program: ProgramTemplate, index: number): ProgramWeek {
  const week = program.blocks[0]?.weeks[index]
  if (week === undefined) throw new Error('missing week ' + String(index))
  return week
}

function weeklyVolume(week: ProgramWeek): Record<MuscleGroup, number> {
  return sumVolume(
    week.days.map((day) =>
      volumeForSlots(
        day.slots.flatMap((slot) =>
          slot.exercise.kind === 'specific'
            ? [{ exerciseId: slot.exercise.exerciseId, sets: slot.sets }]
            : [],
        ),
        (id) => lookup(id),
      ),
    ),
  )
}

describe('the assembled block', () => {
  const program = build()
  const block = program.blocks[0]

  it('runs six working weeks plus a deload by default', () => {
    expect(block?.weeks).toHaveLength(7)
    expect(block?.weeks[6]?.isDeload).toBe(true)
    expect(block?.weeks.filter((week) => week.isDeload)).toHaveLength(1)
  })

  it('needs no training maxes, because RTS finds the load by feel', () => {
    expect(program.requiredTrainingMaxes).toEqual([])
  })

  it('opens three of four days with a competition lift', () => {
    const week = block?.weeks[0]
    const mains = (week?.days ?? []).map((day) =>
      day.slots
        .filter((slot) => slot.role === 'main')
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
    )

    // The press-led upper day carries none: the overhead press is
    // hypertrophy work under this model, not part of the total.
    expect(mains).toEqual([[], ['low-bar-squat'], ['bench-press'], ['sumo-deadlift']])
  })

  it('prescribes strength work by RPE rather than by a percentage', () => {
    const benchDay = block?.weeks[0]?.days[2]
    const main = benchDay?.slots.find((slot) => slot.role === 'main')

    expect(main?.sets[0]?.load.kind).toBe('rpe')
    expect(main?.sets[0]?.notes).toMatch(/work up until this feels like/i)
    expect(main?.notes).toMatch(/fatigue target/)
  })

  it('gives the prioritised lift more back-off volume than the maintained ones', () => {
    const week = block?.weeks[0]
    const setsFor = (dayIndex: number): number =>
      week?.days[dayIndex]?.slots.find((slot) => slot.role === 'main')?.sets.length ?? 0

    // Bench is tier 1, squat and deadlift tier 2.
    expect(setsFor(2)).toBeGreaterThan(setsFor(1))
    expect(setsFor(2)).toBeGreaterThan(setsFor(3))
  })
})

describe('constant proximity to failure', () => {
  const program = build()

  it('holds every hypertrophy work set at one rep in reserve', () => {
    const sets = (program.blocks[0]?.weeks[0]?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'accessory' || slot.role === 'assistance')
      .flatMap((slot) => slot.sets.slice(0, -1))

    expect(sets.length).toBeGreaterThan(0)
    // RPE 9 is one rep in reserve. No ramp across the block.
    expect(sets.every((set) => set.load.kind === 'rpe' && set.load.target === 9)).toBe(true)
  })

  it('does not ramp RPE across the weeks', () => {
    const rpeInWeek = (weekIndex: number): number[] =>
      (program.blocks[0]?.weeks[weekIndex]?.days ?? [])
        .flatMap((day) => day.slots)
        .filter((slot) => slot.role === 'accessory' || slot.role === 'assistance')
        .flatMap((slot) => slot.sets.slice(0, -1))
        .flatMap((set) => (set.load.kind === 'rpe' ? [set.load.target] : []))

    expect(new Set([...rpeInWeek(0), ...rpeInWeek(3), ...rpeInWeek(5)])).toEqual(new Set([9]))
  })

  it('takes the last set to failure only where failing is safe', () => {
    const slots = (program.blocks[0]?.weeks[2]?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'accessory' || slot.role === 'assistance')

    for (const slot of slots) {
      if (slot.exercise.kind !== 'specific') continue
      const exercise = lookup(slot.exercise.exerciseId)
      const last = slot.sets[slot.sets.length - 1]

      if (exercise?.safeToFail === true) {
        expect(last?.load).toEqual({ kind: 'rpe', target: 10 })
      } else {
        // A skullcrusher over your face with no spotter stays at 1 RIR.
        expect(last?.load).toEqual({ kind: 'rpe', target: 9 })
      }
    }
  })
})

describe('tiers driving volume', () => {
  const program = build()

  it('gives a tier-1 muscle more weekly volume than a tier-3 one', () => {
    const week = program.blocks[0]?.weeks[3]
    if (!week) throw new Error('missing week')

    const volume = weeklyVolume(week)

    expect(volume.biceps).toBeGreaterThan(volume.calves)
    expect(volume['side-delts']).toBeGreaterThan(volume.calves)
  })

  it('weights the three arm muscles equally, as tiered', () => {
    const positions = (['biceps', 'triceps', 'forearms'] as const).map((muscle) =>
      priorityPosition(DEFAULT_MUSCLE_TIERS, muscle),
    )
    expect(new Set(positions).size).toBe(1)
  })

  it('ramps volume into position rather than opening at the ceiling', () => {
    const first = weeklyVolume(weekAt(program, 0))
    const last = weeklyVolume(weekAt(program, 5))

    expect(last.biceps).toBeGreaterThan(first.biceps)
  })

  it('never exceeds maximum recoverable volume in any week', () => {
    for (const [index, week] of (program.blocks[0]?.weeks ?? []).entries()) {
      const volume = weeklyVolume(week)

      for (const muscle of Object.keys(volume) as MuscleGroup[]) {
        expect(
          volume[muscle],
          `${muscle} over MRV in week ${String(index + 1)}`,
        ).toBeLessThanOrEqual(DEFAULT_LANDMARKS[muscle].mrv)
      }
    }
  })

  it('drops to maintenance on the deload', () => {
    const deload = weeklyVolume(weekAt(program, 6))
    const peak = weeklyVolume(weekAt(program, 5))

    expect(deload.biceps).toBeLessThan(peak.biceps)
  })
})

describe('the split', () => {
  it('trains every muscle it programmes at least twice a week', () => {
    const program = build()
    const week = program.blocks[0]?.weeks[3]
    if (!week) throw new Error('missing week')

    const daysTraining = (muscle: MuscleGroup): number =>
      week.days.filter((day) =>
        day.slots.some((slot) => {
          if (slot.exercise.kind !== 'specific') return false
          const exercise = lookup(slot.exercise.exerciseId)
          if (exercise === undefined) return false
          if (slot.sets.every((set) => set.isWarmup === true)) return false
          return exercise.primaryMuscle === muscle || exercise.secondaryMuscles.includes(muscle)
        }),
      ).length

    const volume = weeklyVolume(week)
    const trained = (Object.keys(volume) as MuscleGroup[]).filter((muscle) => volume[muscle] >= 4)

    expect(trained.length).toBeGreaterThan(6)
    for (const muscle of trained) {
      expect(daysTraining(muscle), `${muscle} trained on too few days`).toBeGreaterThanOrEqual(2)
    }
  })

  it.each([2, 3, 4, 5, 6])('supports a %i-day week', (days) => {
    const program = build({ daysPerWeek: days })
    expect(program.blocks[0]?.weeks[0]?.days).toHaveLength(days)
  })

  it('puts a warm-up at the top of every day', () => {
    const program = build()

    for (const day of program.blocks[0]?.weeks[0]?.days ?? []) {
      expect(day.slots[0]?.role).toBe('conditioning')
      expect(day.slots[0]?.sets.every((set) => set.isWarmup === true)).toBe(true)
    }
  })

  it('counts no volume for warm-ups', () => {
    const program = build()
    const withWarmUps = weeklyVolume(weekAt(program, 0))

    const without = build({ includeWarmUps: false })
    const withoutWarmUps = weeklyVolume(weekAt(without, 0))

    expect(withWarmUps).toEqual(withoutWarmUps)
  })
})

describe('respecting the gym', () => {
  it('honours excluded exercises', () => {
    const program = build({ excludedExercises: [asExerciseId('dips')] })

    const ids = (program.blocks[0]?.weeks ?? [])
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

    expect(ids).not.toContain('dips')
  })

  it('is deterministic', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()))
  })
})
