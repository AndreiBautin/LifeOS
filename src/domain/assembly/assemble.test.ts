import { describe, expect, it } from 'vitest'

import { builtInExercises, MAIN_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { asExerciseId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { ProgramTemplate, Slot } from '@/domain/programs/program'
import { findSplit, type SplitDefinition } from '@/domain/splits/split'
import { volumeForSlots } from '@/domain/volume/accounting'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import { assembleProgram, rpeForWeek, type AssembleDeps } from './assemble'
import { defaultRecipe, DEFAULT_ASSISTANCE, type ProgramRecipe } from './recipe'

const exercises = builtInExercises()
const lookup = (id: string): (typeof exercises)[number] | undefined =>
  exercises.find((exercise) => exercise.id === id)

const mainLifts = {
  squat: asExerciseId(MAIN_LIFT_SLUGS.squat),
  bench: asExerciseId(MAIN_LIFT_SLUGS.bench),
  deadlift: asExerciseId(MAIN_LIFT_SLUGS.deadlift),
  press: asExerciseId(MAIN_LIFT_SLUGS.press),
}

/** A counter, so an assembled program is byte-identical run to run. */
function counterIds(): IdGenerator {
  let n = 0
  return {
    next: () => {
      n += 1
      return `id-${String(n)}`
    },
  }
}

function deps(splitId = 'four-day-main'): AssembleDeps {
  const split = findSplit(splitId)
  if (!split) throw new Error(`unknown split ${splitId}`)
  return { exercises, split, ids: counterIds(), now: new Date('2026-08-24T00:00:00Z') }
}

function build(recipe: ProgramRecipe, splitId?: string): ProgramTemplate {
  return assembleProgram(recipe, asProgramId('p1'), deps(splitId))
}

const recipe = defaultRecipe(mainLifts)

describe('assembling 5/3/1 BBB onto a four-day split', () => {
  const program = build(recipe)
  const block = program.blocks[0]

  it('produces one repeating block of four weeks', () => {
    expect(program.blocks).toHaveLength(1)
    expect(block?.weeks).toHaveLength(4)
    expect(block?.repeat).toBe('indefinite')
  })

  it('gives every week four training days', () => {
    expect(block?.weeks.map((week) => week.days.length)).toEqual([4, 4, 4, 4])
  })

  it('opens each day with its main lift, in the split’s order', () => {
    const week = block?.weeks[0]
    const mains = week?.days.map((day) => {
      const slot = day.slots[0]
      return slot?.role === 'main' && slot.exercise.kind === 'specific'
        ? slot.exercise.exerciseId
        : undefined
    })

    expect(mains).toEqual([
      MAIN_LIFT_SLUGS.press,
      MAIN_LIFT_SLUGS.deadlift,
      MAIN_LIFT_SLUGS.bench,
      MAIN_LIFT_SLUGS.squat,
    ])
  })

  it('follows the main lift with five sets of ten of the same lift', () => {
    const benchDay = block?.weeks[0]?.days[2]
    const supplemental = benchDay?.slots[1]

    expect(supplemental?.role).toBe('supplemental')
    expect(supplemental?.sets).toHaveLength(5)
    expect(supplemental?.exercise).toEqual({
      kind: 'specific',
      exerciseId: MAIN_LIFT_SLUGS.bench,
    })
    expect(supplemental?.sets[0]?.reps).toEqual({ kind: 'fixed', reps: 10 })
  })

  it('drops the supplemental work on the deload week but keeps the main lift', () => {
    const deloadWeek = block?.weeks[3]
    expect(deloadWeek?.isDeload).toBe(true)

    for (const day of deloadWeek?.days ?? []) {
      expect(day.slots.some((slot) => slot.role === 'main')).toBe(true)
      expect(day.slots.some((slot) => slot.role === 'supplemental')).toBe(false)
    }
  })

  it('carries the progression rules that move the training maxes', () => {
    const labels = block?.progression.map((rule) => rule.label) ?? []

    expect(labels).toContain('Bench and press training maxes +5 each cycle')
    expect(labels).toContain('Squat and deadlift training maxes +10 each cycle')
    expect(labels.some((label) => label.includes('Boring But Big climbs 50% → 60%'))).toBe(true)
  })

  it('declares exactly the four maxes the program needs', () => {
    expect([...program.requiredTrainingMaxes].sort()).toEqual(
      [
        MAIN_LIFT_SLUGS.bench,
        MAIN_LIFT_SLUGS.squat,
        MAIN_LIFT_SLUGS.deadlift,
        MAIN_LIFT_SLUGS.press,
      ].sort(),
    )
  })

  it('is deterministic — the same recipe assembles the same program twice', () => {
    expect(JSON.stringify(build(recipe))).toBe(JSON.stringify(build(recipe)))
  })
})

describe('the assistance layer accounting for what the framework spent', () => {
  const program = build(recipe)
  const week = program.blocks[0]?.weeks[0]

  const slotsFor = (dayIndex: number): readonly Slot[] => week?.days[dayIndex]?.slots ?? []

  const volumeFor = (dayIndex: number): Record<MuscleGroup, number> =>
    volumeForSlots(
      slotsFor(dayIndex).flatMap((slot) =>
        slot.exercise.kind === 'specific'
          ? [{ exerciseId: slot.exercise.exerciseId, sets: slot.sets }]
          : [],
      ),
      (id) => lookup(id),
    )

  it('adds little or no chest work to a bench day already carrying eight chest sets', () => {
    // Bench day: 3 main working sets + 5 BBB sets = 8 chest sets before
    // any accessory exists. Chest is trained twice a week on this split
    // and its week-1 target is MEV (8), so the per-session share is 4 —
    // already exceeded. The filler must not pile more chest on top.
    const chestAccessories = slotsFor(2).filter(
      (slot) =>
        slot.role !== 'main' &&
        slot.role !== 'supplemental' &&
        slot.exercise.kind === 'specific' &&
        lookup(slot.exercise.exerciseId)?.primaryMuscle === 'chest',
    )

    expect(chestAccessories).toHaveLength(0)
  })

  it('still gives rear delts work on that day, because the framework spent none there', () => {
    expect(volumeFor(2)['rear-delts']).toBeGreaterThan(0)
  })

  it('never drives a muscle past its maximum recoverable volume in a week', () => {
    for (const [weekIndex, programWeek] of (program.blocks[0]?.weeks ?? []).entries()) {
      const weekly = programWeek.days.reduce<Partial<Record<MuscleGroup, number>>>((acc, day) => {
        const dayVolume = volumeForSlots(
          day.slots.flatMap((slot) =>
            slot.exercise.kind === 'specific'
              ? [{ exerciseId: slot.exercise.exerciseId, sets: slot.sets }]
              : [],
          ),
          (id) => lookup(id),
        )
        for (const muscle of Object.keys(dayVolume) as MuscleGroup[]) {
          acc[muscle] = (acc[muscle] ?? 0) + dayVolume[muscle]
        }
        return acc
      }, {})

      for (const muscle of Object.keys(weekly) as MuscleGroup[]) {
        expect(
          weekly[muscle] ?? 0,
          `${muscle} exceeded MRV in week ${String(weekIndex + 1)}`,
        ).toBeLessThanOrEqual(DEFAULT_LANDMARKS[muscle].mrv)
      }
    }
  })

  it('ramps accessory volume across the working weeks and cuts it on the deload', () => {
    const accessorySetsIn = (weekIndex: number): number =>
      (program.blocks[0]?.weeks[weekIndex]?.days ?? [])
        .flatMap((day) => day.slots)
        .filter((slot) => slot.role === 'accessory' || slot.role === 'assistance')
        .reduce((sum, slot) => sum + slot.sets.length, 0)

    const [w1, w2, w3, deload] = [0, 1, 2, 3].map(accessorySetsIn)

    // The shape LiftTracker hardcoded as 3 → 4 → 5 → 2, now derived from
    // each muscle's own MEV and MAV rather than applied uniformly.
    expect(w2).toBeGreaterThanOrEqual(w1 ?? 0)
    expect(w3).toBeGreaterThanOrEqual(w2 ?? 0)
    expect(deload).toBeLessThan(w1 ?? 0)
  })

  it('prescribes assistance by RPE, not by percentage of a training max', () => {
    const accessorySets = slotsFor(0)
      .filter((slot) => slot.role === 'accessory' || slot.role === 'assistance')
      .flatMap((slot) => slot.sets)

    expect(accessorySets.length).toBeGreaterThan(0)
    expect(accessorySets.every((set) => set.load.kind === 'rpe')).toBe(true)
  })

  it('respects the ceiling on accessories per session', () => {
    for (const day of week?.days ?? []) {
      const accessories = day.slots.filter(
        (slot) => slot.role === 'accessory' || slot.role === 'assistance',
      )
      expect(accessories.length).toBeLessThanOrEqual(DEFAULT_ASSISTANCE.maxSlotsPerDay)
    }
  })

  it('never selects the same exercise twice in one session', () => {
    for (const day of week?.days ?? []) {
      const ids = day.slots.flatMap((slot) =>
        slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [],
      )
      // The supplemental slot deliberately repeats the main lift, so that
      // pair is expected; nothing else should collide.
      const accessoryIds = day.slots
        .filter((slot) => slot.role === 'accessory' || slot.role === 'assistance')
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

      expect(new Set(accessoryIds).size).toBe(accessoryIds.length)
      expect(ids.length).toBeGreaterThan(0)
    }
  })

  it('honours an excluded exercise', () => {
    const excluded = build({
      ...recipe,
      assistance: {
        ...recipe.assistance,
        excludedExercises: [asExerciseId('rope-pushdown'), asExerciseId('face-pull')],
      },
    })

    const allIds = excluded.blocks
      .flatMap((block) => block.weeks)
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

    expect(allIds).not.toContain('rope-pushdown')
    expect(allIds).not.toContain('face-pull')
  })

  it('produces framework work and nothing else when assistance is switched off', () => {
    const bare = build({
      ...recipe,
      assistance: { ...recipe.assistance, policy: 'none' },
    })

    const roles = new Set(
      bare.blocks
        .flatMap((block) => block.weeks)
        .flatMap((week) => week.days)
        .flatMap((day) => day.slots)
        .map((slot) => slot.role),
    )

    expect([...roles].sort()).toEqual(['main', 'supplemental'])
  })
})

describe('the same framework on different splits', () => {
  it.each([
    ['four-day-main', 4],
    ['upper-lower-4', 4],
    ['ppl-6', 6],
    ['ppl-ul-5', 5],
    ['three-day-rotating', 3],
    ['two-day', 2],
  ])('%s produces %i training days a week', (splitId, expectedDays) => {
    const program = build(recipe, splitId)
    for (const week of program.blocks[0]?.weeks ?? []) {
      expect(week.days).toHaveLength(expectedDays)
    }
  })

  it('leaves the pull days on a six-day PPL without a main lift', () => {
    const program = build(recipe, 'ppl-6')
    const week = program.blocks[0]?.weeks[0]

    const hasMain = week?.days.map((day) => day.slots.some((slot) => slot.role === 'main'))

    // Push A, Pull A, Legs A, Push B, Pull B, Legs B — the pull days carry
    // no main lift because the deadlift already sits on a legs day.
    expect(hasMain).toEqual([true, false, true, true, false, true])
  })

  it('fills a main-lift-free pull day with back volume rather than leaving it empty', () => {
    const program = build(recipe, 'ppl-6')
    const pullDay = program.blocks[0]?.weeks[0]?.days[1]

    expect(pullDay?.slots.length).toBeGreaterThan(0)
    expect(pullDay?.slots.every((slot) => slot.role !== 'main')).toBe(true)
  })

  it('rotates the four main lifts across a three-day week', () => {
    const program = build(recipe, 'three-day-rotating')
    const mainsPerWeek = (program.blocks[0]?.weeks ?? []).map((week) =>
      week.days.flatMap((day) =>
        day.slots
          .filter((slot) => slot.role === 'main')
          .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
      ),
    )

    // Three lifts a week over four weeks, so the pattern only closes at
    // the end — no week repeats the same lift twice.
    for (const week of mainsPerWeek) {
      expect(new Set(week).size).toBe(week.length)
    }
    expect(new Set(mainsPerWeek.flat()).size).toBe(4)
  })
})

describe('supplemental variants', () => {
  it('sends Boring But Big to the opposite lift when configured to', () => {
    const program = build({
      ...recipe,
      framework: {
        ...recipe.framework,
        supplemental: { ...recipe.framework.supplemental, lift: 'opposite' },
      },
    })

    const benchDay = program.blocks[0]?.weeks[0]?.days[2]
    const supplemental = benchDay?.slots[1]

    expect(supplemental?.exercise).toEqual({
      kind: 'specific',
      exerciseId: MAIN_LIFT_SLUGS.press,
    })
  })

  it('drops the supplemental slot entirely when set to none', () => {
    const program = build({
      ...recipe,
      framework: {
        ...recipe.framework,
        supplemental: { ...recipe.framework.supplemental, style: 'none' },
      },
    })

    const slots = (program.blocks[0]?.weeks ?? [])
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)

    expect(slots.some((slot) => slot.role === 'supplemental')).toBe(false)
  })
})

describe('the peaking block', () => {
  const program = build({
    ...recipe,
    cycles: {
      count: 3,
      peaking: { enabled: true, rampPercents: [92.5, 97.5], testOpenerPercent: 100 },
    },
  })

  it('is appended after the 5/3/1 block', () => {
    expect(program.blocks).toHaveLength(2)
    expect(program.blocks[1]?.phase).toBe('peaking')
    expect(program.blocks[0]?.repeat).toBe(3)
  })

  it('strips everything except the main lift', () => {
    const roles = new Set(
      program.blocks[1]?.weeks.flatMap((week) =>
        week.days.flatMap((day) => day.slots.map((slot) => slot.role)),
      ),
    )
    expect([...roles]).toEqual(['main'])
  })

  it('ends on a test day that works up to a maximal single', () => {
    const weeks = program.blocks[1]?.weeks ?? []
    const testWeek = weeks[weeks.length - 1]

    expect(testWeek?.label).toContain('Test day')

    const topSet = testWeek?.days[0]?.slots[0]?.sets[0]
    expect(topSet?.reps).toEqual({ kind: 'amrap', minimum: 1 })
    expect(topSet?.load).toEqual({ kind: 'percent-training-max', percent: 100 })
  })
})

describe('the assistance RPE ramp', () => {
  it('reproduces LiftTracker’s 7 → 8 → 9 progression with a deload at 5', () => {
    const ramp = [0, 1, 2].map((week) => rpeForWeek(DEFAULT_ASSISTANCE, week, 3, false))
    expect(ramp).toEqual([7, 8, 9])
    expect(rpeForWeek(DEFAULT_ASSISTANCE, 3, 3, true)).toBe(5)
  })

  it('interpolates in half points over a longer block', () => {
    const ramp = [0, 1, 2, 3, 4].map((week) => rpeForWeek(DEFAULT_ASSISTANCE, week, 5, false))
    expect(ramp).toEqual([7, 7.5, 8, 8.5, 9])
  })

  it('is editable — a lifter who trains harder gets a harder ramp', () => {
    const aggressive = { ...DEFAULT_ASSISTANCE, startRpe: 8, endRpe: 10 }
    expect([0, 1, 2].map((week) => rpeForWeek(aggressive, week, 3, false))).toEqual([8, 9, 10])
  })
})

describe('validation', () => {
  it('refuses to assemble around a main lift that is not in the library', () => {
    const broken = defaultRecipe({ ...mainLifts, squat: asExerciseId('nonexistent') })

    expect(() => build(broken)).toThrow(/no entry for Squat/)
  })

  it('refuses a split with no training days', () => {
    const emptySplit: SplitDefinition = {
      id: 'empty',
      name: 'Empty',
      description: '',
      daysPerWeek: 0,
      cycleWeeks: 1,
      days: [],
    }

    expect(() =>
      assembleProgram(recipe, asProgramId('p1'), {
        exercises,
        split: emptySplit,
        ids: counterIds(),
        now: new Date('2026-08-24T00:00:00Z'),
      }),
    ).toThrow(/no training days/)
  })

  it('refuses inverted set bounds', () => {
    expect(() =>
      build({
        ...recipe,
        assistance: { ...recipe.assistance, minSetsPerSlot: 5, maxSetsPerSlot: 2 },
      }),
    ).toThrow(/cannot exceed the maximum/)
  })
})
