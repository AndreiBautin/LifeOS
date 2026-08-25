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

  const weeks: ProgramWeek[] = framework.weeks.map((frameworkWeek, weekIndex) => {
    /*
     * Days are built in order, threading a running weekly total through
     * them.
     *
     * Building each day independently and dividing the weekly budget by
     * frequency looks equivalent and is not: the day carrying both the
     * main lift and its supplemental work can spend far more than its
     * even share on one muscle, and a later day dividing the *original*
     * target by frequency would then add more on top. That is how a
     * four-day 5/3/1 ends up prescribing fourteen front-delt sets against
     * a ceiling of twelve.
     */
    const splitDays = daysForWeek(deps.split, weekIndex)

    /*
     * Two passes.
     *
     * The framework's work is fixed and known for the whole week before
     * any assistance is chosen, so it is totalled first. Filling day by
     * day instead lets Monday's accessories spend a budget that Thursday's
     * main lift is going to need — a bench day's own pressing pays the
     * front delts, and an accessory chosen on the press day two days
     * earlier cannot know that.
     *
     * Assistance is the remainder after the framework, not a co-equal
     * claimant on the budget.
     */
    const frameworkByDay = splitDays.map((splitDay) =>
      buildFrameworkSlots({ recipe, deps, frameworkWeek, splitDay }),
    )
    const frameworkWeekSpend = frameworkByDay.reduce<VolumeMap>(
      (total, built) => addInto(total, built.spent),
      emptyVolumeMap(),
    )

    let assistanceSpent = emptyVolumeMap()

    const days = splitDays.map((splitDay, dayIndex) => {
      const framework = frameworkByDay[dayIndex]
      if (framework === undefined) {
        return { index: dayIndex, label: splitDay.label, slots: [] }
      }

      const built = buildDay({
        recipe,
        deps,
        frameworkWeek,
        splitDay,
        dayIndex,
        weekIndex,
        workingWeeks,
        assistance,
        frameworkSlots: framework.slots,
        frameworkDaySpend: framework.spent,
        // Everything the week has already committed: all framework work,
        // plus assistance chosen on earlier days.
        weekSpent: addInto(frameworkWeekSpend, assistanceSpent),
        remainingDays: splitDays.slice(dayIndex + 1),
      })

      assistanceSpent = addInto(assistanceSpent, built.spent)
      return built.day
    })

    return {
      index: weekIndex,
      label: frameworkWeek.label,
      isDeload: frameworkWeek.isDeload,
      days,
    }
  })

  return {
    index: 0,
    label: '5/3/1 cycle',
    phase: 'strength',
    weeks,
    progression: buildProgressionRules(recipe),
    repeat: recipe.cycles.count,
  }
}

interface FrameworkArgs {
  readonly recipe: ProgramRecipe
  readonly deps: AssembleDeps
  readonly frameworkWeek: FiveThreeOneWeek
  readonly splitDay: SplitDay
}

interface BuiltSlots {
  readonly slots: readonly Slot[]
  readonly spent: VolumeMap
}

/**
 * The main and supplemental work for one day — everything the framework
 * dictates, with no reference to volume targets.
 *
 * Separated out so a whole week of it can be totalled before any
 * accessory is chosen. The framework is not negotiable; assistance is.
 */
function buildFrameworkSlots({ recipe, deps, frameworkWeek, splitDay }: FrameworkArgs): BuiltSlots {
  const slots: Slot[] = []
  let spent: VolumeMap = emptyVolumeMap()

  const record = (exerciseId: ExerciseId, sets: readonly SetPrescription[]): void => {
    const exercise = findExercise(deps.exercises, exerciseId)
    if (exercise !== undefined) spent = addInto(spent, slotVolume(exercise, sets))
  }

  if (splitDay.mainLift === undefined) return { slots, spent }

  const exerciseId = recipe.framework.mainLifts[splitDay.mainLift]
  const mainSets = mainSetPrescriptions(frameworkWeek, {
    includeWarmups: recipe.framework.includeWarmups,
  })

  slots.push({
    id: asSlotId(deps.ids.next()),
    role: 'main',
    exercise: { kind: 'specific', exerciseId },
    sets: mainSets,
    restSeconds: recipe.framework.mainRestSeconds,
    notes: `${MAIN_LIFT_LABELS[splitDay.mainLift]} — ${frameworkWeek.label}`,
  })
  record(exerciseId, mainSets)

  const targetLift: MainLiftSlot =
    recipe.framework.supplemental.lift === 'same'
      ? splitDay.mainLift
      : OPPOSITE_LIFT[splitDay.mainLift]

  // Cycle 1 percentages are baked in; the climb across cycles is a
  // progression rule, so the template shows where it starts and the rule
  // shows where it goes.
  const supplementalSets = supplementalPrescriptions(
    recipe.framework.supplemental,
    frameworkWeek,
    1,
  )

  if (supplementalSets.length > 0) {
    const supplementalId = recipe.framework.mainLifts[targetLift]
    slots.push({
      id: asSlotId(deps.ids.next()),
      role: 'supplemental',
      exercise: { kind: 'specific', exerciseId: supplementalId },
      sets: supplementalSets,
      restSeconds: recipe.framework.supplementalRestSeconds,
    })
    record(supplementalId, supplementalSets)
  }

  return { slots, spent }
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
  readonly frameworkSlots: readonly Slot[]
  /** What the framework spends on this day specifically. */
  readonly frameworkDaySpend: VolumeMap
  /** Everything the week has committed: all framework, plus earlier assistance. */
  readonly weekSpent: VolumeMap
  /** Days still to come this week, so the budget can be shared with them. */
  readonly remainingDays: readonly SplitDay[]
}

interface BuiltDay {
  readonly day: ProgramDay
  /** Assistance volume only — the framework is already counted weekly. */
  readonly spent: VolumeMap
}

function buildDay(args: BuildDayArgs): BuiltDay {
  const { deps, splitDay, dayIndex } = args
  const slots: Slot[] = [...args.frameworkSlots]
  let assistanceSpend = emptyVolumeMap()

  if (args.assistance.policy === 'rp-landmarks') {
    const assistanceSlots = buildAssistanceSlots(args, slots)

    for (const slot of assistanceSlots) {
      if (slot.exercise.kind !== 'specific') continue
      const exercise = findExercise(deps.exercises, slot.exercise.exerciseId)
      if (exercise !== undefined) {
        assistanceSpend = addInto(assistanceSpend, slotVolume(exercise, slot.sets))
      }
    }

    slots.push(...assistanceSlots)
  }

  return {
    day: { index: dayIndex, label: splitDay.label, slots },
    spent: assistanceSpend,
  }
}

/**
 * Fills a day's remaining volume, muscle by muscle.
 *
 * Muscles are visited in order of how much they still owe, so a day that
 * can only fit five accessory slots spends them on what is furthest from
 * target rather than on whatever happens to come first alphabetically.
 */
function buildAssistanceSlots(args: BuildDayArgs, existingSlots: readonly Slot[]): readonly Slot[] {
  const { deps, splitDay, weekIndex, workingWeeks, assistance, frameworkWeek } = args

  const used = new Set<ExerciseId>(
    existingSlots.flatMap((slot) =>
      slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [],
    ),
  )

  const debts = splitDay.muscles
    .map((muscle) => ({
      muscle,
      owed: remainingSetsFor(muscle, args),
    }))
    .filter((entry) => entry.owed >= assistance.minSetsPerSlot)
    .sort((a, b) => b.owed - a.owed)

  const rpe = rpeForWeek(assistance, weekIndex, workingWeeks, frameworkWeek.isDeload)
  const slots: Slot[] = []

  // Tracks what this day's accessories have added, so each choice is
  // checked against the ceilings the previous ones moved.
  let added = emptyVolumeMap()

  for (const { muscle, owed } of debts) {
    if (slots.length >= assistance.maxSlotsPerDay) break

    const exercise = pickAssistanceExercise(deps.exercises, muscle, assistance, used, args)
    if (exercise === undefined) continue

    /*
     * An exercise is chosen to satisfy one muscle and pays several.
     *
     * Dips are picked for the chest and hand half a set each to the front
     * delts and triceps. Checking only the muscle we chose *for* lets
     * those secondary contributions push a different muscle past its
     * ceiling — which is precisely how a press day whose main and
     * supplemental work already spent the front-delt budget still ends up
     * over it. So the whole contribution is checked, and the set count is
     * trimmed until all of it fits.
     */
    const setCount = fittableSets(
      exercise,
      Math.min(assistance.maxSetsPerSlot, Math.round(owed)),
      assistance,
      args,
      added,
    )

    if (setCount < assistance.minSetsPerSlot) continue

    used.add(exercise.id)
    added = addInto(
      added,
      slotVolume(
        exercise,
        Array.from({ length: setCount }, () => STUB_SET),
      ),
    )

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
function remainingSetsFor(muscle: MuscleGroup, args: BuildDayArgs): number {
  const landmarks = args.assistance.landmarks[muscle]
  const weeklyTarget = targetSetsForWeek(
    landmarks,
    args.weekIndex,
    args.workingWeeks,
    args.frameworkWeek.isDeload,
  )

  const frequency = weeklyFrequency(args.deps.split, muscle)
  if (frequency <= 0) return 0

  // Everything below is reasoned in *weekly* terms, then divided among
  // the sessions that are left. Reasoning per-session against the
  // original target lets each day spend a share the earlier days already
  // used.
  // weekSpent already includes every day's framework work, this one
  // included, so the day spend must not be added again.
  const committed = args.weekSpent[muscle]

  const sessionsLeft = 1 + args.remainingDays.filter((day) => day.muscles.includes(muscle)).length

  const share = Math.max(0, (weeklyTarget - committed) / Math.max(1, sessionsLeft))

  /*
   * Maximum recoverable volume is a hard ceiling, not a target the filler
   * may aim past. Without this, a day whose main lift and supplemental
   * work both hit the same muscle would still receive accessories on top
   * of an already-full weekly budget.
   */
  const headroom = Math.max(0, landmarks.mrv - committed)

  return Math.min(share, headroom)
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

/**
 * A placeholder working set, used only to measure what a slot of N sets
 * would contribute. Its prescription is irrelevant — `slotVolume` counts
 * sets, and only cares that this is not a warm-up.
 */
const STUB_SET: SetPrescription = {
  load: { kind: 'rpe', target: 8 },
  reps: { kind: 'range', low: 8, high: 12 },
}

/**
 * The largest number of sets of this exercise that fits under every
 * affected muscle's ceiling — including the ones it only pays a fraction
 * to.
 */
function fittableSets(
  exercise: Exercise,
  desired: number,
  assistance: AssistanceConfig,
  args: BuildDayArgs,
  added: VolumeMap,
): number {
  for (let count = desired; count >= 1; count -= 1) {
    const contribution = slotVolume(
      exercise,
      Array.from({ length: count }, () => STUB_SET),
    )

    const fits = (Object.keys(contribution) as MuscleGroup[]).every((muscle) => {
      if (contribution[muscle] <= 0) return true
      const committed = args.weekSpent[muscle] + added[muscle]
      return committed + contribution[muscle] <= assistance.landmarks[muscle].mrv
    })

    if (fits) return count
  }

  return 0
}
