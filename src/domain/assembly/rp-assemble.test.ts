import { describe, expect, it } from 'vitest'

import { builtInExercises } from '@/domain/exercises/catalogue'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { asExerciseId, asProgramId, type IdGenerator } from '@/domain/ids/ids'
import type { ProgramTemplate, ProgramWeek } from '@/domain/programs/program'
import { DEFAULT_MUSCLE_TIERS, priorityPosition } from '@/domain/priority/tiers'
import {
  SESSION_TOO_LONG_MINUTES,
  SESSION_TOO_SHORT_MINUTES,
} from '@/domain/autoregulation/schedule'
import { estimateDayMinutes } from '@/domain/programs/program'
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

  it('prescribes every working set by feel rather than by a percentage', () => {
    // RTS asks for reps at an RPE and reads the load back off what was
    // done. A percentage-of-something set anywhere in the block would
    // mean a number the lifter has to maintain by hand.
    const kinds = new Set(
      (block?.weeks ?? []).flatMap((week) =>
        week.days.flatMap((day) =>
          day.slots
            .filter((slot) => slot.role !== 'conditioning')
            .flatMap((slot) =>
              slot.sets.filter((set) => set.isWarmup !== true).map((set) => set.load.kind),
            ),
        ),
      ),
    )

    expect([...kinds].sort()).toEqual(['rpe'])
  })

  it('opens three of the five days with a competition lift', () => {
    const week = block?.weeks[0]
    const mains = (week?.days ?? []).map((day) =>
      day.slots
        .filter((slot) => slot.role === 'strength')
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
    )

    // The press-led upper day carries none: the overhead press is
    // hypertrophy work under this model, not part of the total.
    expect(mains).toEqual([[], ['low-bar-squat'], ['bench-press'], ['sumo-deadlift'], []])
  })

  it('labels the top set and the back-offs inside one exercise', () => {
    // One slot, not two. The top set and its back-offs are the same
    // exercise in the same trip to the rack, so splitting them into two
    // rows made a lifter scroll past the lift to find the rest of it.
    // What needed distinguishing was the sets, and they carry labels.
    const benchDay = block?.weeks[0]?.days[2]
    const bench = benchDay?.slots.filter((slot) => slot.role === 'strength') ?? []

    expect(bench).toHaveLength(1)

    const sets = bench[0]?.sets ?? []
    expect(sets[0]?.label).toBe('Top set')
    expect(sets[0]?.notes).toMatch(/work up until this feels like/i)
    expect(sets.slice(1).every((set) => set.label === 'Back-off')).toBe(true)
    expect(bench[0]?.notes).toMatch(/fatigue target/)
  })

  it('gives the prioritised lift more back-off volume than the maintained ones', () => {
    const week = block?.weeks[0]
    const setsFor = (dayIndex: number): number =>
      week?.days[dayIndex]?.slots.find((slot) => slot.role === 'strength')?.sets.length ?? 0

    // Bench is tier 1, squat and deadlift tier 2.
    expect(setsFor(2)).toBeGreaterThan(setsFor(1))
    expect(setsFor(3)).toBeGreaterThan(0)
  })
})

describe('conditioning', () => {
  const program = build()
  const week = weekAt(program, 3)

  const conditioningIn = (dayIndex: number) =>
    (week.days[dayIndex]?.slots ?? []).filter((slot) => slot.role === 'conditioning')

  it('is programmed rather than left to the lifter', () => {
    const all = week.days.flatMap((day) =>
      day.slots
        .filter((slot) => slot.role === 'conditioning')
        .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [])),
    )

    expect(all).toEqual(['incline-walk', 'running', 'kb-swing'])
  })

  it('keeps the hardest session away from the lower days', () => {
    // Swings are intervals with a real systemic cost. On Wednesday they
    // would be paid for out of Thursday's deadlift; on Friday there is
    // nothing left in the week for them to compromise.
    expect(conditioningIn(1)).toEqual([])
    expect(conditioningIn(3)).toEqual([])
  })

  it('is prescribed by time, not by reps', () => {
    for (const day of week.days) {
      for (const slot of day.slots.filter((candidate) => candidate.role === 'conditioning')) {
        expect(slot.sets[0]?.reps.kind).toBe('time')
      }
    }
  })

  it('counts toward the session budget rather than riding along free', () => {
    // A twenty-five minute run costed as one thirty-second set let the
    // planner stack conditioning onto the longest day and still believe
    // the day fitted inside the target.
    const withRun = estimateDayMinutes(week.days[2] as never)
    const conditioningMinutes = conditioningIn(2).reduce(
      (total, slot) =>
        total +
        slot.sets.reduce((sum, set) => sum + (set.reps.kind === 'time' ? set.reps.seconds : 0), 0) /
          60,
      0,
    )

    expect(conditioningMinutes).toBeGreaterThan(20)
    expect(withRun).toBeGreaterThan(conditioningMinutes)
  })

  it('is cut on the deload like everything else', () => {
    const deloadRun = weekAt(program, 6)
      .days.flatMap((day) => day.slots)
      .find((slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId === 'running')
    const workingRun = week.days
      .flatMap((day) => day.slots)
      .find((slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId === 'running')

    const seconds = (slot: typeof deloadRun): number => {
      const set = slot?.sets[0]
      return set?.reps.kind === 'time' ? set.reps.seconds : 0
    }

    expect(seconds(deloadRun)).toBeLessThan(seconds(workingRun))
  })
})

describe('constant proximity to failure', () => {
  const program = build()

  it('holds every hypertrophy work set at one rep in reserve', () => {
    const sets = (program.blocks[0]?.weeks[0]?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'hypertrophy' || slot.role === 'assistance')
      .flatMap((slot) => slot.sets.slice(0, -1))

    expect(sets.length).toBeGreaterThan(0)
    // RPE 9 is one rep in reserve. No ramp across the block.
    expect(sets.every((set) => set.load.kind === 'rpe' && set.load.target === 9)).toBe(true)
  })

  it('does not ramp RPE across the weeks', () => {
    const rpeInWeek = (weekIndex: number): number[] =>
      (program.blocks[0]?.weeks[weekIndex]?.days ?? [])
        .flatMap((day) => day.slots)
        .filter((slot) => slot.role === 'hypertrophy' || slot.role === 'assistance')
        .flatMap((slot) => slot.sets.slice(0, -1))
        .flatMap((set) => (set.load.kind === 'rpe' ? [set.load.target] : []))

    expect(new Set([...rpeInWeek(0), ...rpeInWeek(3), ...rpeInWeek(5)])).toEqual(new Set([9]))
  })

  it('takes the last set to failure only where failing is safe', () => {
    const slots = (program.blocks[0]?.weeks[2]?.days ?? [])
      .flatMap((day) => day.slots)
      .filter((slot) => slot.role === 'hypertrophy' || slot.role === 'assistance')

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

  it.each([2, 3, 5])('supports a %i-day week', (days) => {
    const program = build({ daysPerWeek: days })
    expect(program.blocks[0]?.weeks[0]?.days).toHaveLength(days)
  })

  it('puts a warm-up at the top of every day', () => {
    const program = build()

    for (const day of program.blocks[0]?.weeks[0]?.days ?? []) {
      expect(day.slots[0]?.role).toBe('warmup')
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

  it('honours an exclusion even when the day is anchored to it', () => {
    // An anchor is a strong preference, not an override. Friday is built
    // around dips; a lifter with no dip station still must not be given
    // them, and the day has to fill with something else.
    const program = build({ excludedExercises: [asExerciseId('dips')] })
    const friday = weekAt(program, 3).days[4]

    const ids = (friday?.slots ?? []).flatMap((slot) =>
      slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [],
    )

    expect(ids).not.toContain('dips')
    expect(ids.length).toBeGreaterThan(2)
  })

  it('honours an exclusion on conditioning and on warm-ups', () => {
    // No treadmill, or a shoulder that will not take dislocations.
    const program = build({
      excludedExercises: [asExerciseId('running'), asExerciseId('shoulder-dislocation')],
    })

    const ids = (program.blocks[0]?.weeks ?? [])
      .flatMap((week) => week.days)
      .flatMap((day) => day.slots)
      .flatMap((slot) => (slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : []))

    expect(ids).not.toContain('running')
    expect(ids).not.toContain('shoulder-dislocation')
  })

  it('is deterministic', () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()))
  })
})

describe('session length', () => {
  const program = build()

  it('keeps every day under the two hours that would demand another session', () => {
    for (const week of program.blocks[0]?.weeks ?? []) {
      for (const day of week.days) {
        expect(estimateDayMinutes(day), `${day.label} in ${week.label} runs too long`).toBeLessThan(
          SESSION_TOO_LONG_MINUTES,
        )
      }
    }
  })

  it('gives every day of the week a session worth making the trip for', () => {
    /*
     * The failure this guards against is specific, and both halves of it
     * have actually happened. With legs maintained and arms specialised,
     * a split piles every accessory onto the upper days — which then run
     * long while the lower days finish in thirty. And a day accountable
     * only for muscles that are trained daily arrives last with its
     * weekly target already spent: the dedicated arms day came out at
     * twenty-four minutes, which is not a session.
     *
     * Asserting a floor and a ceiling per day rather than a ratio between
     * them, because the ratio is satisfied by a week that is uniformly
     * too short as well as by a balanced one.
     */
    const peak = weekAt(program, 5)

    for (const day of peak.days) {
      const minutes = estimateDayMinutes(day)
      expect(minutes, `${day.label} is not worth the trip`).toBeGreaterThan(
        SESSION_TOO_SHORT_MINUTES,
      )
      expect(minutes, `${day.label} runs long`).toBeLessThan(90)
    }
  })

  it('averages into the band the frequency autoregulator holds at', () => {
    const peak = weekAt(program, 5)
    const minutes = peak.days.map((day) => estimateDayMinutes(day))
    const average = minutes.reduce((sum, m) => sum + m, 0) / minutes.length

    // Between the two thresholds, so a settled block neither adds nor
    // drops a day.
    expect(average).toBeGreaterThan(SESSION_TOO_SHORT_MINUTES)
    expect(average).toBeLessThan(SESSION_TOO_LONG_MINUTES)
  })

  it('trains the small specialisation muscles on every day', () => {
    // Arms and side delts are tier 1, recover fast, and cost almost
    // nothing systemically — so they carry the balancing load.
    const peak = weekAt(program, 5)

    for (const muscle of ['biceps', 'triceps', 'side-delts'] as const) {
      const days = peak.days.filter((day) =>
        day.slots.some((slot) => {
          if (slot.exercise.kind !== 'specific') return false
          const exercise = lookup(slot.exercise.exerciseId)
          return (
            exercise !== undefined &&
            (exercise.primaryMuscle === muscle || exercise.secondaryMuscles.includes(muscle))
          )
        }),
      ).length

      expect(days, `${muscle} appears on too few days`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('day one continues the session already trained', () => {
  const program = build()

  it('opens the week with exactly the exercises last performed', () => {
    // The press session logged on the 24th: overhead press, pull-ups,
    // dumbbell curls, lateral raises. Anchoring the day to it means the
    // block picks up where training actually is rather than proposing
    // something different for a day that is already done.
    const day = weekAt(program, 0).days[0]
    const names = (day?.slots ?? [])
      .filter((slot) => slot.role !== 'warmup' && slot.role !== 'conditioning')
      .flatMap((slot) =>
        slot.exercise.kind === 'specific' ? [lookup(slot.exercise.exerciseId)?.name ?? ''] : [],
      )

    expect(names.slice(0, 4)).toEqual([
      'Overhead Press',
      'Pull-Up',
      'Dumbbell Lateral Raise',
      'Dumbbell Curl',
    ])
  })

  it('keeps the anchors in every week of the block', () => {
    for (const [index, week] of (program.blocks[0]?.weeks ?? []).entries()) {
      if (week.isDeload) continue

      const ids = (week.days[0]?.slots ?? []).flatMap((slot) =>
        slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId as string] : [],
      )

      for (const anchor of ['overhead-press', 'pull-up', 'db-curl', 'db-lateral-raise']) {
        expect(ids, `${anchor} missing from week ${String(index + 1)}`).toContain(anchor)
      }
    }
  })

  it('ramps the anchors rather than opening them at the ceiling', () => {
    const setsIn = (weekIndex: number, slug: string): number =>
      weekAt(program, weekIndex).days[0]?.slots.find(
        (slot) => slot.exercise.kind === 'specific' && slot.exercise.exerciseId === slug,
      )?.sets.length ?? 0

    // Anchoring a day must not exempt it from the block's ramp, or the
    // days a lifter cares most about are the ones that open maxed out.
    expect(setsIn(5, 'db-lateral-raise')).toBeGreaterThan(setsIn(0, 'db-lateral-raise'))
  })

  it('never programmes two exercises for the same muscle and pattern in one day', () => {
    // Pull-ups followed by chin-ups is not extra stimulus, just extra time.
    for (const week of program.blocks[0]?.weeks ?? []) {
      for (const day of week.days) {
        const seen = new Set<string>()

        for (const slot of day.slots) {
          if (slot.exercise.kind !== 'specific') continue
          const exercise = lookup(slot.exercise.exerciseId)
          if (exercise?.intent !== 'hypertrophy') continue

          const key = `${exercise.primaryMuscle}|${exercise.pattern}`
          expect(seen.has(key), `${day.label} repeats ${key}`).toBe(false)
          seen.add(key)
        }
      }
    }
  })
})
