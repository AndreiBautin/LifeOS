import { DomainError, invariant } from '@/domain/errors/domain-error'
import type { Exercise } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { FiveThreeOneWeek } from '@/domain/framework/five-three-one'
import {
  mainSetPrescriptions,
  supplementalPrescriptions,
  validateWeeks,
} from '@/domain/framework/five-three-one'
import type { ExerciseId, IdGenerator, ProgramId } from '@/domain/ids/ids'
import { asSlotId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'
import type {
  ProgramBlock,
  ProgramDay,
  ProgramTemplate,
  ProgramWeek,
  Slot,
} from '@/domain/programs/program'
import type { ProgressionRule } from '@/domain/programs/progression-rule'
import type { MainLiftSlot, SplitDay, SplitDefinition } from '@/domain/splits/split'
import {
  daysForWeek,
  IS_LOWER_BODY,
  MAIN_LIFT_LABELS,
  weeklyFrequency,
} from '@/domain/splits/split'
import { slotVolume, type VolumeMap } from '@/domain/volume/accounting'
import { emptyVolumeMap, targetSetsForWeek } from '@/domain/volume/landmarks'

import { OPPOSITE_LIFT, type AssistanceConfig, type ProgramRecipe } from './recipe'

/**
 * Composing a recipe into a program.
 *
 * Three layers meet here, and the order matters:
 *
 *   1. The **framework** places a main lift on each day that the split
 *      assigns one, at percentages of a training max, and adds its
 *      supplemental work.
 *   2. The **split** decides how many days there are, which lift lands on
 *      which, and which muscles each day is accountable for.
 *   3. The **assistance layer** measures what layers 1 and 2 already spent
 *      on each muscle and fills the gap up to that muscle's share of its
 *      weekly volume target.
 *
 * Step 3 is what makes this a single program rather than 5/3/1 with an
 * unrelated bodybuilding routine bolted on. A bench day under BBB has
 * already spent eight chest sets before assistance is considered, so the
 * chest gets little or nothing more; the same day's rear delts have spent
 * none, so they get their full share.
 *
 * The result is an ordinary `ProgramTemplate`. Nothing downstream knows
 * it was assembled, and every set in it can be edited by hand.
 */

export interface AssembleDeps {
  readonly exercises: readonly Exercise[]
  readonly split: SplitDefinition
  readonly ids: IdGenerator
  readonly now: Date
}

export function assembleProgram(
  recipe: ProgramRecipe,
  programId: ProgramId,
  deps: AssembleDeps,
): ProgramTemplate {
  validateWeeks(recipe.framework.weeks)
  validateRecipe(recipe, deps)

  const timestamp = deps.now.toISOString()
  const blocks: ProgramBlock[] = [buildFrameworkBlock(recipe, deps)]

  const peaking = recipe.cycles.peaking
  if (peaking?.enabled === true) {
    blocks.push(buildPeakingBlock(recipe, deps, blocks.length))
  }

  return {
    id: programId,
    name: recipe.name,
    description: recipe.description,
    origin: 'custom',
    blocks,
    settings: recipe.settings,
    requiredTrainingMaxes: requiredMaxesFor(recipe, deps.split),
    tags: ['5/3/1', recipe.framework.supplemental.style, deps.split.id],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/* -------------------------------------------------------------------- */
/* The 5/3/1 block                                                       */
/* -------------------------------------------------------------------- */

function buildFrameworkBlock(recipe: ProgramRecipe, deps: AssembleDeps): ProgramBlock {
  const { framework, assistance } = recipe
  const workingWeeks = framework.weeks.filter((week) => !week.isDeload).length

  const weeks: ProgramWeek[] = framework.weeks.map((frameworkWeek, weekIndex) => ({
    index: weekIndex,
    label: frameworkWeek.label,
    isDeload: frameworkWeek.isDeload,
    days: daysForWeek(deps.split, weekIndex).map((splitDay, dayIndex) =>
      buildDay({
        recipe,
        deps,
        frameworkWeek,
        splitDay,
        dayIndex,
        weekIndex,
        workingWeeks,
        assistance,
      }),
    ),
  }))

  return {
    index: 0,
    label: '5/3/1 cycle',
    phase: 'strength',
    weeks,
    progression: buildProgressionRules(recipe),
    repeat: recipe.cycles.count,
  }
}

interface BuildDayArgs {
  readonly recipe: ProgramRecipe
  readonly deps: AssembleDeps
  readonly frameworkWeek: FiveThreeOneWeek
  readonly splitDay: SplitDay
  readonly dayIndex: number
  readonly weekIndex: number
  readonly workingWeeks: number
  readonly assistance: AssistanceConfig
}

function buildDay(args: BuildDayArgs): ProgramDay {
  const { recipe, deps, frameworkWeek, splitDay, dayIndex } = args
  const slots: Slot[] = []
  let spent: VolumeMap = emptyVolumeMap()

  const record = (exerciseId: ExerciseId, sets: readonly SetPrescription[]): void => {
    const exercise = findExercise(deps.exercises, exerciseId)
    if (exercise !== undefined) spent = addInto(spent, slotVolume(exercise, sets))
  }

  /* 1. Main lift ----------------------------------------------------- */
  if (splitDay.mainLift !== undefined) {
    const exerciseId = recipe.framework.mainLifts[splitDay.mainLift]
    const sets = mainSetPrescriptions(frameworkWeek, {
      includeWarmups: recipe.framework.includeWarmups,
    })

    slots.push({
      id: asSlotId(deps.ids.next()),
      role: 'main',
      exercise: { kind: 'specific', exerciseId },
      sets,
      restSeconds: recipe.framework.mainRestSeconds,
      notes: `${MAIN_LIFT_LABELS[splitDay.mainLift]} — ${frameworkWeek.label}`,
    })
    record(exerciseId, sets)
  }

  /* 2. Supplemental --------------------------------------------------- */
  if (splitDay.mainLift !== undefined) {
    const targetLift: MainLiftSlot =
      recipe.framework.supplemental.lift === 'same'
        ? splitDay.mainLift
        : OPPOSITE_LIFT[splitDay.mainLift]

    // Cycle 1 percentages are baked in; the climb across cycles is a
    // progression rule, so the template shows where it starts and the
    // rule shows where it goes.
    const sets = supplementalPrescriptions(recipe.framework.supplemental, frameworkWeek, 1)

    if (sets.length > 0) {
      const exerciseId = recipe.framework.mainLifts[targetLift]
      slots.push({
        id: asSlotId(deps.ids.next()),
        role: 'supplemental',
        exercise: { kind: 'specific', exerciseId },
        sets,
        restSeconds: recipe.framework.supplementalRestSeconds,
      })
      record(exerciseId, sets)
    }
  }

  /* 3. Assistance, filling the remainder ------------------------------ */
  if (args.assistance.policy === 'rp-landmarks') {
    slots.push(...buildAssistanceSlots(args, spent, slots))
  }

  return {
    index: dayIndex,
    label: splitDay.label,
    slots,
  }
}

/**
 * Fills a day's remaining volume, muscle by muscle.
 *
 * Muscles are visited in order of how much they still owe, so a day that
 * can only fit five accessory slots spends them on what is furthest from
 * target rather than on whatever happens to come first alphabetically.
 */
function buildAssistanceSlots(
  args: BuildDayArgs,
  spent: VolumeMap,
  existingSlots: readonly Slot[],
): readonly Slot[] {
  const { deps, splitDay, weekIndex, workingWeeks, assistance, frameworkWeek } = args

  const used = new Set<ExerciseId>(
    existingSlots.flatMap((slot) =>
      slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [],
    ),
  )

  const debts = splitDay.muscles
    .map((muscle) => ({
      muscle,
      owed: remainingSetsFor(muscle, args, spent),
    }))
    .filter((entry) => entry.owed >= assistance.minSetsPerSlot)
    .sort((a, b) => b.owed - a.owed)

  const rpe = rpeForWeek(assistance, weekIndex, workingWeeks, frameworkWeek.isDeload)
  const slots: Slot[] = []

  for (const { muscle, owed } of debts) {
    if (slots.length >= assistance.maxSlotsPerDay) break

    const exercise = pickAssistanceExercise(deps.exercises, muscle, assistance, used, args)
    if (exercise === undefined) continue

    used.add(exercise.id)

    const setCount = Math.min(assistance.maxSetsPerSlot, Math.round(owed))
    const range = exercise.defaultRepRange ?? defaultRangeFor(exercise.isCompound)

    slots.push({
      id: asSlotId(deps.ids.next()),
      role: exercise.isCompound ? 'accessory' : 'assistance',
      exercise: { kind: 'specific', exerciseId: exercise.id },
      sets: Array.from({ length: setCount }, () => ({
        load: { kind: 'rpe' as const, target: rpe },
        reps: { kind: 'range' as const, low: range.low, high: range.high },
      })),
      restSeconds: exercise.defaultRestSeconds ?? assistance.restSeconds,
    })
  }

  return slots
}

/** A muscle's share of its weekly target for this session, minus what is spent. */
function remainingSetsFor(muscle: MuscleGroup, args: BuildDayArgs, spent: VolumeMap): number {
  const landmarks = args.assistance.landmarks[muscle]
  const weeklyTarget = targetSetsForWeek(
    landmarks,
    args.weekIndex,
    args.workingWeeks,
    args.frameworkWeek.isDeload,
  )

  const frequency = weeklyFrequency(args.deps.split, muscle)
  if (frequency <= 0) return 0

  const perSessionTarget = weeklyTarget / frequency
  return Math.max(0, perSessionTarget - spent[muscle])
}

/**
 * The target RPE for assistance work in a given week.
 *
 * Preserves LiftTracker's ramp — `9 - (3 - mesoWeek)`, so week 1 at RPE 7
 * climbing to RPE 9 with the deload dropping to 5 — but as three numbers
 * a lifter can change rather than as an expression inside a generator.
 */
export function rpeForWeek(
  assistance: AssistanceConfig,
  weekIndex: number,
  workingWeeks: number,
  isDeload: boolean,
): number {
  if (isDeload) return assistance.deloadRpe
  if (workingWeeks <= 1) return assistance.startRpe

  const progress = Math.min(weekIndex, workingWeeks - 1) / (workingWeeks - 1)
  const value = assistance.startRpe + (assistance.endRpe - assistance.startRpe) * progress
  return Math.round(value * 2) / 2
}

/**
 * Chooses an accessory for a muscle.
 *
 * Deterministic: the same recipe always assembles the same program, which
 * is what makes the result testable and what stops a lifter's programme
 * changing under them when they reopen the builder. Variety across days
 * comes from rotating the candidate list by the day index rather than
 * from randomness.
 */
function pickAssistanceExercise(
  pool: readonly Exercise[],
  muscle: MuscleGroup,
  assistance: AssistanceConfig,
  used: ReadonlySet<ExerciseId>,
  args: BuildDayArgs,
): Exercise | undefined {
  const excluded = new Set(assistance.excludedExercises)

  const candidates = pool.filter(
    (exercise) =>
      exercise.primaryMuscle === muscle &&
      !exercise.isArchived &&
      !exercise.isCompetition &&
      !used.has(exercise.id) &&
      !excluded.has(exercise.id),
  )

  if (candidates.length === 0) return undefined

  const preference = (exercise: Exercise): number => {
    const index = assistance.preferredEquipment.indexOf(exercise.equipment)
    return index === -1 ? assistance.preferredEquipment.length : index
  }

  const ordered = [...candidates].sort((a, b) => {
    const byPreference = preference(a) - preference(b)
    if (byPreference !== 0) return byPreference
    // Compounds first: they buy more stimulus per set, so if a day only
    // has room for one exercise for this muscle it should be the bigger one.
    if (a.isCompound !== b.isCompound) return a.isCompound ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // Rotate so the same muscle does not get the identical exercise on
  // every day of the week.
  const offset = (args.dayIndex + args.weekIndex) % ordered.length
  return ordered[offset]
}

function defaultRangeFor(isCompound: boolean): { low: number; high: number } {
  // Carried from LiftTracker's RepRangeType seed: compound accessories in
  // the 8–12 band, isolation work higher.
  return isCompound ? { low: 8, high: 12 } : { low: 12, high: 15 }
}

/* -------------------------------------------------------------------- */
/* Progression                                                           */
/* -------------------------------------------------------------------- */

function buildProgressionRules(recipe: ProgramRecipe): readonly ProgressionRule[] {
  const { mainLifts, trainingMaxProgression: tm, supplemental } = recipe.framework

  const lower = (Object.keys(mainLifts) as MainLiftSlot[])
    .filter((lift) => IS_LOWER_BODY[lift])
    .map((lift) => mainLifts[lift])
  const upper = (Object.keys(mainLifts) as MainLiftSlot[])
    .filter((lift) => !IS_LOWER_BODY[lift])
    .map((lift) => mainLifts[lift])

  const rules: ProgressionRule[] = [
    {
      kind: 'adjust-training-max',
      exercises: upper,
      delta: { kind: 'absolute', amount: tm.upperIncrement },
      condition: {
        kind: 'amrap-at-least',
        reps: tm.resetBelowAmrapReps,
        selector: { kind: 'role', role: 'main' },
      },
      label: `Bench and press training maxes +${String(tm.upperIncrement)} each cycle`,
    },
    {
      kind: 'adjust-training-max',
      exercises: lower,
      delta: { kind: 'absolute', amount: tm.lowerIncrement },
      condition: {
        kind: 'amrap-at-least',
        reps: tm.resetBelowAmrapReps,
        selector: { kind: 'role', role: 'main' },
      },
      label: `Squat and deadlift training maxes +${String(tm.lowerIncrement)} each cycle`,
    },
    {
      kind: 'reset-training-max',
      exercises: 'all',
      toPercent: tm.resetToPercent,
      condition: {
        kind: 'amrap-below',
        reps: tm.resetBelowAmrapReps,
        selector: { kind: 'role', role: 'main' },
      },
      label: `Cut the training max to ${String(tm.resetToPercent)}% after a missed AMRAP`,
    },
  ]

  if (supplemental.style === 'bbb' && supplemental.percentPerCycle !== 0) {
    rules.push({
      kind: 'adjust-load-percent',
      selector: { kind: 'role', role: 'supplemental' },
      deltaPercent: supplemental.percentPerCycle,
      maxPercent: supplemental.maxPercent,
      condition: { kind: 'always' },
      label: `Boring But Big climbs ${String(supplemental.percent)}% → ${String(supplemental.maxPercent)}%`,
    })
  }

  return rules
}

/* -------------------------------------------------------------------- */
/* Peaking                                                               */
/* -------------------------------------------------------------------- */

/**
 * A short block that strips volume and finishes by working up to a single.
 *
 * This is the explicit half of establishing a new one-rep max. The AMRAP
 * sets in every cycle already produce an estimate continuously; a tested
 * single replaces the estimate with a measurement, and the training maxes
 * are re-derived from it.
 */
function buildPeakingBlock(recipe: ProgramRecipe, deps: AssembleDeps, index: number): ProgramBlock {
  const peaking = recipe.cycles.peaking
  invariant(
    peaking !== undefined,
    'PEAKING_MISSING',
    'A peaking block was requested without config.',
  )

  /**
   * Days that carry a main lift, paired with that lift. A peaking block
   * has nothing to do on a day without one, so those days drop out
   * entirely rather than becoming empty sessions.
   */
  const liftDays = (weekIndex: number): readonly { lift: MainLiftSlot; label: string }[] =>
    daysForWeek(deps.split, weekIndex).flatMap((splitDay) =>
      splitDay.mainLift === undefined ? [] : [{ lift: splitDay.mainLift, label: splitDay.label }],
    )

  const weeks: ProgramWeek[] = peaking.rampPercents.map((percent, weekIndex) => ({
    index: weekIndex,
    label: `Peak week ${String(weekIndex + 1)} — ${String(percent)}%`,
    isDeload: false,
    days: liftDays(weekIndex).map(({ lift, label }, dayIndex) => ({
      index: dayIndex,
      label,
      slots: [
        {
          id: asSlotId(deps.ids.next()),
          role: 'main' as const,
          exercise: {
            kind: 'specific' as const,
            exerciseId: recipe.framework.mainLifts[lift],
          },
          sets: [
            {
              load: { kind: 'percent-training-max' as const, percent: percent - 15 },
              reps: { kind: 'fixed' as const, reps: 3 },
              isWarmup: true,
            },
            {
              load: { kind: 'percent-training-max' as const, percent: percent - 7.5 },
              reps: { kind: 'fixed' as const, reps: 2 },
              isWarmup: true,
            },
            {
              load: { kind: 'percent-training-max' as const, percent },
              reps: { kind: 'fixed' as const, reps: 1 },
            },
          ],
          restSeconds: recipe.framework.mainRestSeconds,
          notes: 'Taper — volume is stripped so the single is fresh.',
        },
      ],
    })),
  }))

  weeks.push({
    index: weeks.length,
    label: 'Test day — work up to a new max',
    isDeload: false,
    days: liftDays(0).map(({ lift, label }, dayIndex) => ({
      index: dayIndex,
      label: `${label} — test`,
      slots: [
        {
          id: asSlotId(deps.ids.next()),
          role: 'main' as const,
          exercise: {
            kind: 'specific' as const,
            exerciseId: recipe.framework.mainLifts[lift],
          },
          sets: [
            {
              load: {
                kind: 'percent-training-max' as const,
                percent: peaking.testOpenerPercent,
              },
              reps: { kind: 'amrap' as const, minimum: 1 },
              notes: 'Opener. Add weight and repeat while the bar still moves.',
            },
          ],
          restSeconds: recipe.framework.mainRestSeconds + 120,
          notes:
            'Work up in small jumps until the single is genuinely maximal, then stop. Training maxes are re-derived from what you hit.',
        },
      ],
    })),
  })

  return {
    index,
    label: 'Peaking',
    phase: 'peaking',
    weeks,
    progression: [],
    repeat: 1,
  }
}

/* -------------------------------------------------------------------- */
/* Helpers                                                               */
/* -------------------------------------------------------------------- */

function requiredMaxesFor(recipe: ProgramRecipe, split: SplitDefinition): readonly ExerciseId[] {
  const lifts = new Set<MainLiftSlot>()
  for (const day of split.days) {
    if (day.mainLift !== undefined) lifts.add(day.mainLift)
  }

  // Supplemental work on the opposite lift needs that lift's max too,
  // even on a split where it never appears as a main lift.
  if (recipe.framework.supplemental.lift === 'opposite') {
    for (const lift of [...lifts]) lifts.add(OPPOSITE_LIFT[lift])
  }

  return [...lifts].map((lift) => recipe.framework.mainLifts[lift])
}

function findExercise(pool: readonly Exercise[], id: ExerciseId): Exercise | undefined {
  return pool.find((exercise) => exercise.id === id)
}

function addInto(target: VolumeMap, addition: VolumeMap): VolumeMap {
  const result = { ...target }
  for (const muscle of Object.keys(addition) as MuscleGroup[]) {
    result[muscle] += addition[muscle]
  }
  return result
}

function validateRecipe(recipe: ProgramRecipe, deps: AssembleDeps): void {
  const missing = (Object.keys(recipe.framework.mainLifts) as MainLiftSlot[]).filter(
    (lift) => findExercise(deps.exercises, recipe.framework.mainLifts[lift]) === undefined,
  )

  if (missing.length > 0) {
    throw new DomainError(
      `The exercise library has no entry for ${missing.map((lift) => MAIN_LIFT_LABELS[lift]).join(', ')}. A main lift must exist before a program can be built around it.`,
      'RECIPE_MAIN_LIFT_MISSING',
    )
  }

  invariant(
    deps.split.days.length > 0,
    'RECIPE_SPLIT_EMPTY',
    `The split "${deps.split.name}" has no training days.`,
  )
  invariant(
    recipe.assistance.minSetsPerSlot <= recipe.assistance.maxSetsPerSlot,
    'RECIPE_SET_BOUNDS',
    'The minimum sets per accessory cannot exceed the maximum.',
  )
}
