import { invariant } from '@/domain/errors/domain-error'
import { WARM_UPS } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { HYPERTROPHY_RPE } from '@/domain/exercises/loading'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { RtsPrescription } from '@/domain/framework/rts'
import { DEFAULT_RTS } from '@/domain/framework/rts'
import type { ExerciseId, IdGenerator, ProgramId } from '@/domain/ids/ids'
import { asExerciseId, asSlotId } from '@/domain/ids/ids'
import type { SetPrescription } from '@/domain/programs/prescription'
import type {
  ProgramDay,
  ProgramSettings,
  ProgramTemplate,
  ProgramWeek,
  Slot,
} from '@/domain/programs/program'
import { DEFAULT_PROGRAM_SETTINGS, setSeconds } from '@/domain/programs/program'
import type { MuscleTiers, StrengthLift, StrengthTiers } from '@/domain/priority/tiers'
import {
  DEFAULT_MUSCLE_TIERS,
  DEFAULT_STRENGTH_TIERS,
  priorityPosition,
  validateTiers,
  weeklyTargetForWeek,
} from '@/domain/priority/tiers'
import { describeBlock } from '@/domain/priority/explain'
import type { RpDay, RpSplit } from '@/domain/splits/rp-splits'
import { rpFrequency, rpSplitForDays } from '@/domain/splits/rp-splits'
import { slotVolume, type VolumeMap } from '@/domain/volume/accounting'
import { emptyVolumeMap, SECONDARY_SET_FRACTION } from '@/domain/volume/landmarks'
import type { LandmarkSet } from '@/domain/volume/landmarks'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

import {
  DEFAULT_DAYS_PER_WEEK,
  DEFAULT_WEEKS_BEFORE_DELOAD,
} from '@/domain/autoregulation/schedule'

/**
 * Assembling an RP block with RTS strength work.
 *
 * Reads top to bottom as the decisions actually stack:
 *
 *   1. **Tiers set the ceiling.** Each muscle's weekly target comes from
 *      where its tier sits and how concentrated the tier structure is.
 *   2. **The week ramps into it.** Week one opens near MEV and climbs, so
 *      the block has somewhere to go.
 *   3. **Strength work is placed first** and its volume counted, because
 *      the competition lifts are not negotiable and they pay several
 *      muscles at once.
 *   4. **Hypertrophy fills the remainder**, cheapest-first by SFR, capped
 *      at MRV across the whole week rather than per session.
 *
 * Step 4's ordering is what a garage gym makes matter. With no cables,
 * the difference between filling side delts with lateral raises and
 * filling them with upright rows is most of the week's systemic budget.
 */

export interface RpRecipe {
  readonly name: string
  readonly description: string
  readonly strengthTiers: StrengthTiers
  readonly muscleTiers: MuscleTiers
  readonly landmarks: LandmarkSet
  readonly daysPerWeek: number
  readonly weeksBeforeDeload: number
  readonly rts: RtsPrescription
  readonly includeWarmUps: boolean
  readonly maxHypertrophySlotsPerDay: number
  /**
   * Roughly how long a session should run.
   *
   * A real constraint, not a hint. Volume targets alone do not distribute
   * evenly across days — the day carrying the featured lift and the big
   * pulls claims the shared small-muscle budget first simply because it is
   * built first, and the last day of the week gets the leftovers. Capping
   * the fill by projected duration is what makes the *week* balanced
   * rather than just the totals.
   */
  readonly targetSessionMinutes: number
  readonly minSetsPerSlot: number
  readonly maxSetsPerSlot: number
  readonly excludedExercises: readonly ExerciseId[]
  readonly settings: ProgramSettings
}

export function defaultRpRecipe(overrides: Partial<RpRecipe> = {}): RpRecipe {
  const muscleTiers = overrides.muscleTiers ?? DEFAULT_MUSCLE_TIERS
  const strengthTiers = overrides.strengthTiers ?? DEFAULT_STRENGTH_TIERS

  // Named and described from the tiers rather than by hand, so the block
  // cannot go on calling itself an arms specialisation after the arms
  // have been moved down.
  const described = describeBlock(muscleTiers, strengthTiers)

  return {
    name: described.name,
    description: described.description,
    strengthTiers,
    muscleTiers,
    landmarks: DEFAULT_LANDMARKS,
    // Five, matching `DEFAULT_SETTINGS`. Four has to carry the week's
    // volume in four sittings and runs the upper days long; six divides
    // it so finely that several sessions are not worth the trip.
    daysPerWeek: DEFAULT_DAYS_PER_WEEK,
    weeksBeforeDeload: DEFAULT_WEEKS_BEFORE_DELOAD,
    rts: DEFAULT_RTS,
    includeWarmUps: true,
    maxHypertrophySlotsPerDay: 6,
    targetSessionMinutes: 70,
    minSetsPerSlot: 2,
    maxSetsPerSlot: 5,
    excludedExercises: [],
    settings: DEFAULT_PROGRAM_SETTINGS,
    ...overrides,
  }
}

export interface RpAssembleDeps {
  readonly exercises: readonly Exercise[]
  readonly ids: IdGenerator
  readonly now: Date
}

export function assembleRpProgram(
  recipe: RpRecipe,
  programId: ProgramId,
  deps: RpAssembleDeps,
): ProgramTemplate {
  validateTiers(recipe.muscleTiers)
  validateTiers(recipe.strengthTiers)
  invariant(
    recipe.weeksBeforeDeload >= 1,
    'RP_BLOCK_TOO_SHORT',
    'A block needs at least one working week.',
  )

  const split = rpSplitForDays(recipe.daysPerWeek)
  const timestamp = deps.now.toISOString()
  const workingWeeks = recipe.weeksBeforeDeload

  const weeks: ProgramWeek[] = []
  for (let weekIndex = 0; weekIndex <= workingWeeks; weekIndex += 1) {
    const isDeload = weekIndex === workingWeeks
    weeks.push(buildWeek(recipe, deps, split, weekIndex, workingWeeks, isDeload))
  }

  return {
    id: programId,
    name: recipe.name,
    description: recipe.description,
    origin: 'custom',
    blocks: [
      {
        index: 0,
        label: `${String(workingWeeks)}-week block`,
        phase: 'hypertrophy',
        weeks,
        // Progression is autoregulated in-session by RTS rather than
        // scheduled, so the block carries no percentage rules.
        progression: [],
        repeat: 'indefinite',
      },
    ],
    settings: recipe.settings,
    tags: ['rp', 'rts', split.id],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

/* -------------------------------------------------------------------- */

function buildWeek(
  recipe: RpRecipe,
  deps: RpAssembleDeps,
  split: RpSplit,
  weekIndex: number,
  workingWeeks: number,
  isDeload: boolean,
): ProgramWeek {
  /*
   * Strength work first, for the whole week, before any hypertrophy is
   * chosen. The competition lifts are fixed and they pay several muscles
   * at once — a squat is quads, glutes, hamstrings and core — so filling
   * day by day would let Monday's accessories spend a budget Thursday's
   * deadlift is going to need.
   */
  const strengthByDay = split.days.map((day) => buildStrengthSlots(recipe, deps, day, isDeload))
  const strengthWeekSpend = strengthByDay.reduce<VolumeMap>(
    (total, built) => addInto(total, built.spent),
    emptyVolumeMap(),
  )

  const targets = weeklyTargets(recipe, weekIndex, workingWeeks, isDeload)

  let committed = strengthWeekSpend

  /*
   * Days *already built* on which each muscle received work.
   *
   * Counted as the week is assembled rather than totalled up front:
   * pre-counting the whole week's strength spend would tell the press day
   * that the chest is already served, because the bench day two sessions
   * later pays it — and the press day would then skip it, leaving the
   * chest trained once on a split built to train it twice.
   */
  const daysTrained = Object.fromEntries(
    (Object.keys(recipe.landmarks) as MuscleGroup[]).map((muscle) => [muscle, 0]),
  ) as Record<MuscleGroup, number>

  const days: ProgramDay[] = []
  // Everything the week has used so far, so a later day can reach for
  // something else while anything else remains.
  const usedThisWeek = new Set<ExerciseId>()

  for (const [dayIndex, splitDay] of split.days.entries()) {
    const strength = strengthByDay[dayIndex]
    const slots: Slot[] = []

    if (recipe.includeWarmUps) {
      slots.push(...warmUpSlots(deps, splitDay, new Set(recipe.excludedExercises)))
    }

    slots.push(...(strength?.slots ?? []))

    // Costed before the fill and appended after it. Conditioning is done
    // last but is not free: a twenty-five minute run has to come out of
    // the session budget, or the accessory work is chosen as though the
    // day ends thirty minutes before it does.
    const conditioning = conditioningSlots(
      deps,
      splitDay,
      isDeload,
      new Set(recipe.excludedExercises),
    )

    const remainingDays = split.days.slice(dayIndex + 1)
    const filled = fillHypertrophy({
      recipe,
      deps,
      splitDay,
      split,
      targets,
      committed,
      remainingDays,
      alreadyUsed: new Set(
        slots.flatMap((slot) =>
          slot.exercise.kind === 'specific' ? [slot.exercise.exerciseId] : [],
        ),
      ),
      daysTrained,
      existingSlots: [...slots, ...conditioning],
      usedThisWeek,
    })

    committed = addInto(committed, filled.spent)

    // This day's work — strength and hypertrophy together — counts once
    // per muscle toward frequency.
    const dayTotal = addInto(strength?.spent ?? emptyVolumeMap(), filled.spent)
    for (const muscle of Object.keys(dayTotal) as MuscleGroup[]) {
      if (dayTotal[muscle] > 0) daysTrained[muscle] += 1
    }

    slots.push(...filled.slots)
    slots.push(...conditioning)

    const ordered = inSessionOrder(slots, deps.exercises)

    days.push({
      index: dayIndex,
      label: describeDay(splitDay, ordered, deps.exercises, targets),
      slots: ordered,
    })

    for (const slot of slots) {
      if (slot.exercise.kind === 'specific') usedThisWeek.add(slot.exercise.exerciseId)
    }
  }

  return {
    index: weekIndex,
    label: isDeload ? 'Deload' : `Week ${String(weekIndex + 1)}`,
    isDeload,
    days,
  }
}

/** Each muscle's weekly set target for this week of the block. */
function weeklyTargets(
  recipe: RpRecipe,
  weekIndex: number,
  workingWeeks: number,
  isDeload: boolean,
): Record<MuscleGroup, number> {
  const targets = {} as Record<MuscleGroup, number>

  for (const muscle of Object.keys(recipe.landmarks) as MuscleGroup[]) {
    const position = priorityPosition(recipe.muscleTiers, muscle)
    targets[muscle] = weeklyTargetForWeek(
      recipe.landmarks[muscle],
      position,
      weekIndex,
      workingWeeks,
      isDeload,
    )
  }

  return targets
}

/* -------------------------------------------------------------------- */
/* Strength                                                              */
/* -------------------------------------------------------------------- */

interface BuiltSlots {
  readonly slots: readonly Slot[]
  readonly spent: VolumeMap
}

const STRENGTH_SLUG: Record<StrengthLift, string> = {
  squat: 'low-bar-squat',
  bench: 'bench-press',
  deadlift: 'sumo-deadlift',
}

/**
 * The RTS work for a day: a top set at a target reps and RPE, then
 * back-off sets governed by a fatigue percent.
 *
 * The back-offs are prescribed as a *maximum* the lifter will not
 * necessarily reach — the session stops when accumulated fatigue hits the
 * target, which is discovered set by set. Materialising the cap here is
 * what lets the rest of the app treat this like any other slot; the
 * player marks the unused ones as skipped when the stopping rule fires.
 */
function buildStrengthSlots(
  recipe: RpRecipe,
  deps: RpAssembleDeps,
  day: RpDay,
  isDeload: boolean,
): BuiltSlots {
  const lift = day.strengthLift
  if (lift === undefined) return { slots: [], spent: emptyVolumeMap() }

  const exerciseId = asExerciseId(STRENGTH_SLUG[lift])
  const exercise = deps.exercises.find((candidate) => candidate.id === exerciseId)
  if (exercise === undefined) return { slots: [], spent: emptyVolumeMap() }

  const position = priorityPosition(recipe.strengthTiers, lift)

  // A prioritised lift earns a higher fatigue target — more back-off
  // volume — while a maintained one gets the top set and little else.
  const fatigueTarget = isDeload ? 0 : Math.round((2 + position * 5) * 10) / 10

  const topSetRpe = isDeload ? 6 : recipe.rts.topSetRpe

  const topSet: SetPrescription = {
    load: { kind: 'rpe', target: topSetRpe },
    reps: { kind: 'fixed', reps: recipe.rts.topSetReps },
    label: 'Top set',
    notes: `Work up until this feels like RPE ${String(topSetRpe)}.`,
  }

  const backoffCap = isDeload
    ? 1
    : Math.max(1, Math.min(recipe.rts.maxBackoffSets, Math.round(2 + position * 4)))

  const backoffs: SetPrescription[] = Array.from({ length: backoffCap }, (_unused, index) => ({
    load: { kind: 'rpe' as const, target: Math.max(6, topSetRpe - 0.5) },
    reps: { kind: 'fixed' as const, reps: recipe.rts.topSetReps },
    label: 'Back-off',
    ...(index === 0
      ? { notes: `Stop when you are ${String(fatigueTarget)}% off the top set.` }
      : {}),
  }))

  // One slot, with the sets labelled. The top set and its back-offs are
  // the same exercise in the same trip to the rack; splitting them into
  // two rows made a lifter scroll past the lift to find the rest of it.
  // What actually needed distinguishing was the *sets*, and they carry
  // their own labels.
  const slot: Slot = {
    id: asSlotId(deps.ids.next()),
    role: 'strength',
    exercise: { kind: 'specific', exerciseId },
    sets: [topSet, ...backoffs],
    restSeconds: exercise.defaultRestSeconds ?? 180,
    notes: isDeload
      ? 'Deload — top set and one back-off, both easy.'
      : `${describeMethod(recipe.rts)} · ${String(fatigueTarget)}% fatigue target`,
  }

  return { slots: [slot], spent: slotVolume(exercise, slot.sets) }
}

function describeMethod(rts: RtsPrescription): string {
  switch (rts.method) {
    case 'load-drop':
      return `Load drop ${String(rts.loadDropPercent ?? 5)}%`
    case 'repeats':
      return 'Repeats at the same weight'
    case 'rep-drop':
      return 'Rep drops at the same weight'
  }
}

/* -------------------------------------------------------------------- */
/* Hypertrophy                                                           */
/* -------------------------------------------------------------------- */

interface FillArgs {
  readonly recipe: RpRecipe
  readonly deps: RpAssembleDeps
  readonly splitDay: RpDay
  readonly split: RpSplit
  readonly targets: Record<MuscleGroup, number>
  readonly committed: VolumeMap
  readonly remainingDays: readonly RpDay[]
  readonly alreadyUsed: ReadonlySet<ExerciseId>
  /** Days so far this week on which each muscle has received any work. */
  readonly daysTrained: Record<MuscleGroup, number>
  /** Slots already placed today — warm-ups, strength, featured lift. */
  readonly existingSlots: readonly Slot[]
  /**
   * Exercises already used earlier in this week.
   *
   * Avoided where there is any alternative. Restricting this to
   * *yesterday* was not enough: the same upright row kept turning up on
   * Tuesday and Thursday, which reads — correctly — as the generator
   * having run out of ideas. A week that names four different movements
   * for the side delts is a better week than one that names the same one
   * four times, even where the volume is identical.
   */
  readonly usedThisWeek: ReadonlySet<ExerciseId>
}

function fillHypertrophy(args: FillArgs): BuiltSlots {
  const { recipe, deps, splitDay, committed } = args

  const used = new Set(args.alreadyUsed)
  const slots: Slot[] = []
  const placed: Exercise[] = []
  let added = emptyVolumeMap()

  // What the day already costs before any accessory is chosen.
  let minutes = args.existingSlots.reduce((total, slot) => total + slotMinutes(slot), 0)

  /*
   * The exercises this day is pinned to, in order and before anything the
   * debt ordering would choose. They come first because they are the
   * reason the day has the shape it does.
   */
  const excludedFromRecipe = new Set(recipe.excludedExercises)

  for (const slug of splitDay.anchors ?? []) {
    const exercise = deps.exercises.find(
      (candidate) => candidate.id === asExerciseId(slug) && !candidate.isArchived,
    )
    if (exercise === undefined || used.has(exercise.id)) continue
    // An anchor is a strong preference, not an override. A lifter who has
    // said they cannot do an exercise — no dip station, no bar — means it
    // whether or not the split is built around it.
    if (excludedFromRecipe.has(exercise.id)) continue

    /*
     * An anchor ramps like anything else.
     *
     * Taking the maximum every week would mean the block opens at its
     * ceiling on exactly the days a lifter cares most about — which is
     * the thing ramping exists to prevent — and would leave week one
     * lopsided, with an anchored day at its peak while every other day is
     * still climbing. The floor keeps the anchor present even in week
     * one, because a day pinned to an exercise should contain it.
     */
    const owed = anchorDemand(exercise, args, addInto(committed, added))
    const wanted = Math.max(
      recipe.minSetsPerSlot,
      Math.min(recipe.maxSetsPerSlot, Math.round(owed)),
    )

    const count = fittableSets(exercise, wanted, recipe, addInto(committed, added))
    if (count < recipe.minSetsPerSlot) continue

    used.add(exercise.id)
    const sets = hypertrophySets(exercise, count)
    added = addInto(added, slotVolume(exercise, sets))

    const slot: Slot = {
      id: asSlotId(deps.ids.next()),
      role: exercise.isCompound ? 'hypertrophy' : 'assistance',
      exercise: { kind: 'specific', exerciseId: exercise.id },
      sets,
      restSeconds: exercise.defaultRestSeconds ?? 120,
      ...(exercise.defaultRepRange !== undefined && exercise.defaultRepRange.high <= 6
        ? { notes: 'Heavy hypertrophy — one rep in reserve, not a max.' }
        : {}),
    }
    minutes += slotMinutes(slot)
    placed.push(exercise)
    slots.push(slot)
  }

  // Muscles this day is accountable for, neediest first.
  const debts = splitDay.muscles
    .map((muscle) => ({
      muscle,
      owed: shareOwed(muscle, args, addInto(committed, added)),
      daysTrained: args.daysTrained[muscle],
    }))
    .filter((entry) => entry.owed >= recipe.minSetsPerSlot)
    /*
     * Frequency first, then need.
     *
     * An upper day is accountable for nine muscles and has room for six,
     * so a purely need-ordered sort starves the same three every session
     * — and the ones it starves are exactly those the strength work
     * already paid, which is how chest ends up trained once a week on a
     * split built to train it twice. Splitting a weekly target across
     * fewer sessions than planned makes each one less recoverable, which
     * is the whole reason the target was split.
     */
    .sort((a, b) =>
      a.daysTrained !== b.daysTrained ? a.daysTrained - b.daysTrained : b.owed - a.owed,
    )

  for (const { muscle, owed } of debts) {
    if (slots.length >= recipe.maxHypertrophySlotsPerDay) break
    // Out of time. What this day does not spend stays in the weekly
    // budget and is picked up by the sessions that follow.
    if (minutes >= recipe.targetSessionMinutes) break

    const exercise = pickHypertrophyExercise(args, muscle, used, placed)
    if (exercise === undefined) continue

    const setCount = fittableSets(
      exercise,
      Math.min(recipe.maxSetsPerSlot, Math.round(owed)),
      recipe,
      addInto(committed, added),
    )
    if (setCount < recipe.minSetsPerSlot) continue

    const sets = hypertrophySets(exercise, setCount)

    const slot: Slot = {
      id: asSlotId(deps.ids.next()),
      role: exercise.isCompound ? 'hypertrophy' : 'assistance',
      exercise: { kind: 'specific', exerciseId: exercise.id },
      sets,
      restSeconds: exercise.defaultRestSeconds ?? 120,
      ...(exercise.safeToFail
        ? { notes: 'Last set to failure; the rest at one rep in reserve.' }
        : { notes: 'One rep in reserve on every set — not a lift to fail on.' }),
    }

    // Projected, not retrospective. Checking only after adding lets a
    // twelve-minute slot push a sixty-nine minute day to eighty-one.
    const cost = slotMinutes(slot)
    if (minutes + cost > recipe.targetSessionMinutes && slots.length > 0) continue

    used.add(exercise.id)
    added = addInto(added, slotVolume(exercise, sets))
    minutes += cost
    placed.push(exercise)
    slots.push(slot)
  }

  /*
   * Frequency backfill.
   *
   * The debt ordering above optimises for how far each muscle is from its
   * weekly target, and on a day accountable for nine muscles with room
   * for six, the same three lose every time. The ones it starves are
   * whichever the strength work already paid — so a chest fed six sets by
   * the bench press on Wednesday can finish the week trained once, on a
   * split whose entire purpose is to train it twice.
   *
   * Splitting a weekly target across fewer sessions than planned makes
   * each session less recoverable, which is the reason the target was
   * split in the first place. So after the budget is spent, any muscle
   * this day is accountable for that would otherwise end the week below
   * twice-weekly gets one cheap slot.
   */
  for (const muscle of splitDay.muscles) {
    const trainedSoFar = args.daysTrained[muscle]
    const gotWorkToday = added[muscle] > 0
    const daysLeftTrainingIt = args.remainingDays.filter((day) =>
      day.muscles.includes(muscle),
    ).length

    const projected = trainedSoFar + (gotWorkToday ? 1 : 0) + daysLeftTrainingIt
    if (projected >= MINIMUM_WEEKLY_FREQUENCY || gotWorkToday) continue

    const exercise = pickHypertrophyExercise(args, muscle, used, placed)
    if (exercise === undefined) continue

    const count = fittableSets(exercise, recipe.minSetsPerSlot, recipe, addInto(committed, added))
    if (count < recipe.minSetsPerSlot) continue

    used.add(exercise.id)
    const sets = hypertrophySets(exercise, count)
    added = addInto(added, slotVolume(exercise, sets))
    placed.push(exercise)

    slots.push({
      id: asSlotId(deps.ids.next()),
      role: exercise.isCompound ? 'hypertrophy' : 'assistance',
      exercise: { kind: 'specific', exerciseId: exercise.id },
      sets,
      restSeconds: exercise.defaultRestSeconds ?? 120,
      notes: 'Keeps this muscle at twice-weekly frequency.',
    })
  }

  return { slots, spent: added }
}

/**
 * How many sets of an anchored exercise the day actually wants.
 *
 * Judged across **every** muscle the movement trains, not just the one it
 * is filed under. An overhead press is filed under front delts, whose
 * published landmarks top out around six sets a week on the reasoning
 * that pressing covers them — so scoring it on that muscle alone caps a
 * featured lift at two sets, no matter what tier it is placed in.
 *
 * The press also pays the triceps and side delts, both specialisation
 * targets here, and a set that feeds three hungry muscles is worth more
 * than a set that feeds one. So the demand is the largest number of sets
 * any single muscle would need from *this* movement, which for a
 * secondary contribution means scaling by how much of a set it receives.
 *
 * `fittableSets` still caps the result against every affected muscle's
 * MRV, so this raises the ask without letting it overrun.
 */
function anchorDemand(exercise: Exercise, args: FillArgs, committed: VolumeMap): number {
  const contributions: readonly { muscle: MuscleGroup; perSet: number }[] = [
    { muscle: exercise.primaryMuscle, perSet: 1 },
    ...exercise.secondaryMuscles
      .filter((muscle) => muscle !== exercise.primaryMuscle)
      .map((muscle) => ({ muscle, perSet: SECONDARY_SET_FRACTION })),
  ]

  return contributions.reduce((best, { muscle, perSet }) => {
    if (!args.splitDay.muscles.includes(muscle)) return best
    return Math.max(best, shareOwed(muscle, args, committed) / perSet)
  }, 0)
}

/**
 * This day's share of what a muscle still owes for the week.
 *
 * The remaining weekly target divided by the sessions left that train it,
 * so no single day claims a budget the rest of the week needs.
 */
function shareOwed(muscle: MuscleGroup, args: FillArgs, committed: VolumeMap): number {
  const sessionsLeft = 1 + args.remainingDays.filter((day) => day.muscles.includes(muscle)).length

  return Math.max(0, args.targets[muscle] - committed[muscle]) / Math.max(1, sessionsLeft)
}

/** Minutes one slot costs: work plus rest, warm-ups rested through. */
function slotMinutes(slot: Slot): number {
  const rest = slot.restSeconds ?? 120
  return slot.sets.reduce((total, set) => total + setSeconds(set, rest), 0) / 60
}

/** The floor every split here is built to satisfy. */
const MINIMUM_WEEKLY_FREQUENCY = 2

/**
 * Every work set at one rep in reserve, held constant.
 *
 * No ramp across the block. Ramping proximity to failure *and* volume at
 * the same time makes it impossible to attribute a stall to either, and
 * RIR is the variable with the least room to move: past about 2 RIR the
 * stimulus falls away, and at 0 the fatigue stops paying for itself on
 * most sets.
 *
 * The exception is the last set, which goes to failure — but only where
 * failing is neither dangerous nor disproportionately expensive.
 */
function hypertrophySets(exercise: Exercise, count: number): readonly SetPrescription[] {
  const range = exercise.defaultRepRange ?? { low: 8, high: 12 }

  return Array.from({ length: count }, (_unused, index) => {
    const isLast = index === count - 1
    const toFailure = isLast && exercise.safeToFail

    return {
      load: { kind: 'rpe' as const, target: toFailure ? 10 : HYPERTROPHY_RPE },
      reps: { kind: 'range' as const, low: range.low, high: range.high },
      ...(toFailure ? { notes: 'Take this one to failure.' } : {}),
    }
  })
}

/**
 * Picks the cheapest exercise that trains the muscle.
 *
 * Highest stimulus-to-fatigue first, because the systemic budget is the
 * binding constraint on a garage-gym specialisation block — there are no
 * cables to fall back on, so the ordering has to do that work instead.
 */
function pickHypertrophyExercise(
  args: FillArgs,
  muscle: MuscleGroup,
  used: ReadonlySet<ExerciseId>,
  placed: readonly Exercise[],
): Exercise | undefined {
  const excluded = new Set(args.recipe.excludedExercises)

  /*
   * Two movements that train the same muscle through the same pattern are
   * the same exercise as far as a session is concerned. The `used` set
   * stops the identical one repeating; this stops pull-ups being followed
   * by chin-ups, which is not extra stimulus, just extra time.
   */
  const alreadyCovered = new Set(
    placed.map((exercise) => `${exercise.primaryMuscle}|${exercise.pattern}`),
  )

  const candidates = args.deps.exercises.filter(
    (exercise) =>
      exercise.intent === 'hypertrophy' &&
      exercise.primaryMuscle === muscle &&
      !exercise.isArchived &&
      !used.has(exercise.id) &&
      !excluded.has(exercise.id) &&
      !alreadyCovered.has(`${exercise.primaryMuscle}|${exercise.pattern}`),
  )

  if (candidates.length === 0) return undefined

  /*
   * Exercises already used this week go last rather than being removed.
   *
   * A soft penalty, not a filter: for a muscle with one good option in a
   * garage gym, excluding it outright would drop the muscle from the day
   * entirely, which is a worse outcome than repeating it. Sorting it to
   * the back means it is chosen only when nothing else can be.
   */
  const ordered = [...candidates].sort((a, b) => {
    const aUsed = args.usedThisWeek.has(a.id) ? 1 : 0
    const bUsed = args.usedThisWeek.has(b.id) ? 1 : 0
    if (aUsed !== bUsed) return aUsed - bUsed

    if (a.sfr !== b.sfr) return b.sfr - a.sfr
    const aCost = a.systemicCost ?? 0.3
    const bCost = b.systemicCost ?? 0.3
    if (aCost !== bCost) return aCost - bCost
    return a.name.localeCompare(b.name)
  })

  // Rotate slightly by day so the same muscle does not get the identical
  // exercise every session of the week — but rotate only within the
  // candidates the week has not used, or the rotation would land back on
  // one and undo the penalty above.
  const fresh = ordered.filter((exercise) => !args.usedThisWeek.has(exercise.id))
  const pool = fresh.length > 0 ? fresh : ordered

  return pool[args.splitDay.index % pool.length] ?? pool[0]
}

const STUB: SetPrescription = {
  load: { kind: 'rpe', target: HYPERTROPHY_RPE },
  reps: { kind: 'range', low: 8, high: 12 },
}

/**
 * The most sets of this exercise that fit under every affected muscle's
 * ceiling — including the ones it only pays a fraction to.
 */
function fittableSets(
  exercise: Exercise,
  desired: number,
  recipe: RpRecipe,
  committed: VolumeMap,
): number {
  for (let count = desired; count >= 1; count -= 1) {
    const contribution = slotVolume(
      exercise,
      Array.from({ length: count }, () => STUB),
    )

    const fits = (Object.keys(contribution) as MuscleGroup[]).every(
      (muscle) =>
        contribution[muscle] <= 0 ||
        committed[muscle] + contribution[muscle] <= recipe.landmarks[muscle].mrv,
    )

    if (fits) return count
  }

  return 0
}

/* -------------------------------------------------------------------- */

function warmUpSlots(
  deps: RpAssembleDeps,
  day: RpDay,
  excluded: ReadonlySet<ExerciseId>,
): readonly Slot[] {
  return WARM_UPS[day.warmUp].flatMap((plan): Slot[] => {
    const exercise = deps.exercises.find((candidate) => candidate.id === asExerciseId(plan.slug))
    if (exercise === undefined || excluded.has(exercise.id)) return []

    return [
      {
        id: asSlotId(deps.ids.next()),
        role: 'warmup',
        exercise: { kind: 'specific', exerciseId: exercise.id },
        sets: Array.from({ length: plan.sets }, () => ({
          load: { kind: 'open' as const },
          reps: { kind: 'fixed' as const, reps: plan.reps },
          // Warm-ups are flagged so nothing counts them as volume.
          isWarmup: true,
        })),
        restSeconds: 0,
        notes: 'Warm-up. Not counted toward volume.',
      },
    ]
  })
}

/**
 * Conditioning to close a day.
 *
 * Prescribed by time rather than by reps, and given no RPE target: the
 * point of an easy incline walk is that it is easy, and attaching a
 * proximity-to-failure number to it would invite the lifter to race it.
 * Effort is carried in the note instead, where it belongs.
 *
 * Contributes no volume. Conditioning has a systemic cost — which the
 * fatigue model accounts for separately — but counting a run as sets
 * against a muscle's weekly target would displace the growth work the
 * target exists to schedule.
 */
function conditioningSlots(
  deps: RpAssembleDeps,
  day: RpDay,
  isDeload: boolean,
  excluded: ReadonlySet<ExerciseId>,
): readonly Slot[] {
  return (day.conditioning ?? []).flatMap((slug): Slot[] => {
    const exercise = deps.exercises.find((candidate) => candidate.id === asExerciseId(slug))
    if (exercise === undefined || excluded.has(exercise.id)) return []

    const plan = CONDITIONING_PLANS[slug] ?? { minutes: 15, note: 'Easy, conversational pace.' }
    // A deload cuts conditioning the same way it cuts everything else.
    // Leaving it at full duration would make the deload week the hardest
    // conditioning week of the block.
    const minutes = isDeload ? Math.max(10, Math.round(plan.minutes / 2)) : plan.minutes

    return [
      {
        id: asSlotId(deps.ids.next()),
        role: 'conditioning',
        exercise: { kind: 'specific', exerciseId: exercise.id },
        sets: [{ load: { kind: 'open' }, reps: { kind: 'time', seconds: minutes * 60 } }],
        restSeconds: 0,
        notes: plan.note,
      },
    ]
  })
}

/**
 * How each conditioning modality is actually run.
 *
 * Written down rather than derived because the three are not
 * interchangeable: swings are intervals with a real systemic cost, a run
 * is steady aerobic work, and an incline walk is deliberately low enough
 * to cost nothing at all.
 */
const CONDITIONING_PLANS: Readonly<Record<string, { minutes: number; note: string }>> = {
  'incline-walk': {
    minutes: 20,
    note: 'Steep incline, easy pace. You should be able to hold a conversation.',
  },
  running: {
    minutes: 25,
    note: 'Steady aerobic pace — this is the base-building run, not a test.',
  },
  'kb-swing': {
    minutes: 12,
    note: 'Intervals: 30 seconds hard, 30 seconds rest. Hips, not arms.',
  },
}

/**
 * A day named after what is actually in it.
 *
 * "Monday — press and pull" was written into the split, which made it a
 * claim rather than a description: move a tier and the fill changes
 * underneath the label, and the session on screen stops matching the
 * words above it. Reading the label off the finished slots means it
 * cannot be wrong.
 *
 * Built from the muscles that received the most work, capped at three so
 * the result is a name rather than an inventory. The competition lift is
 * named first when there is one, because it is what the day is organised
 * around even when the volume sits elsewhere.
 */
function describeDay(
  splitDay: RpDay,
  slots: readonly Slot[],
  library: readonly Exercise[],
  targets: Record<MuscleGroup, number>,
): string {
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  const worked = emptyVolumeMap()
  let strengthName: string | undefined

  for (const slot of slots) {
    if (slot.exercise.kind !== 'specific') continue
    const exercise = lookup(slot.exercise.exerciseId)
    if (exercise === undefined) continue

    if (slot.role === 'strength') strengthName = exercise.name
    if (slot.role === 'warmup' || slot.role === 'conditioning') continue

    /*
     * Primary muscles only, deliberately.
     *
     * Counting secondaries as well named an upper day after the core,
     * because pull-ups pay it a fraction and the core's weekly target is
     * small enough for that fraction to dominate. A lifter naming a
     * session names what they chose the exercises *for*.
     */
    worked[exercise.primaryMuscle] += slot.sets.filter((set) => set.isWarmup !== true).length
  }

  /*
   * Ranked by the share of a muscle's *week* that lands today, not by raw
   * set count.
   *
   * Sets alone name every day after the arms. They are trained on all
   * five days, so they out-total anything specific to one session and
   * every label came out "biceps and side delts" — including leg day.
   * Share asks the question that actually distinguishes a session: of
   * everything this muscle gets in a week, how much is here?
   */
  const top = (Object.keys(worked) as MuscleGroup[])
    .filter((muscle) => worked[muscle] > 0)
    .map((muscle) => ({ muscle, share: worked[muscle] / Math.max(1, targets[muscle]) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 4)
    .map((entry) => MUSCLE_GROUP_LABELS[entry.muscle].toLowerCase())

  /*
   * The lift keeps its own capitalisation and is separated from the
   * muscles rather than listed alongside them.
   *
   * Run together and lowercased, "low bar squat, quads, calves and
   * hamstrings" reads as four muscles, one of which is oddly specific.
   * They are different kinds of thing — one names the lift the day is
   * built on, the rest name what it grows — and the punctuation should
   * say so. The parenthetical variant is dropped: "Low Bar Squat", not
   * "Low Bar Squat (competition)".
   */
  const lift = strengthName?.replace(/\s*\([^)]*\)\s*/g, '').trim()

  const muscles =
    top.length === 0
      ? undefined
      : top.length === 1
        ? top[0]
        : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1] ?? ''}`

  if (lift === undefined && muscles === undefined) return splitDay.label
  if (lift === undefined) return `${splitDay.label} — ${sentenceCase(muscles ?? '')}`
  if (muscles === undefined) return `${splitDay.label} — ${lift}`

  return `${splitDay.label} — ${lift} · ${muscles}`
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * The order a session is actually performed in.
 *
 * The fill chooses exercises by which muscle is owed the most, which is
 * the right way to decide *what* is in a day and a terrible way to decide
 * *when*. It produced sessions that opened with a maximal deadlift, went
 * to a calf raise, and then came back to a high-bar squat — heavy
 * compound work done on the fatigue of everything that preceded it, for
 * no reason beyond the order the debts happened to be settled in.
 *
 * So placement is a separate pass. Warm-ups, then the competition lift,
 * then compounds heaviest-first while the lifter is fresh, then
 * isolation, then conditioning. Nothing about *what* is in the session
 * changes — only the order, which is the part the debt ordering had no
 * business deciding.
 */
function inSessionOrder(slots: readonly Slot[], library: readonly Exercise[]): readonly Slot[] {
  const rank = (slot: Slot): number => {
    switch (slot.role) {
      case 'warmup':
        return 0
      case 'main':
      case 'strength':
        return 1
      case 'hypertrophy':
        return 2
      case 'assistance':
        return 3
      case 'conditioning':
        return 4
    }
  }

  const cost = (slot: Slot): number => {
    if (slot.exercise.kind !== 'specific') return 0
    const id = slot.exercise.exerciseId
    return library.find((exercise) => exercise.id === id)?.systemicCost ?? 0
  }

  return [...slots]
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => {
      const byRank = rank(a.slot) - rank(b.slot)
      if (byRank !== 0) return byRank

      /*
       * Only the compounds are re-ordered by cost.
       *
       * That is where it matters — a heavy squat done after a light one
       * is a worse squat. Among isolation the costs differ by hundredths
       * and sorting on them only overrides a sequence somebody chose: it
       * put the rotator-cuff work ahead of the shoulder dislocations, and
       * curls ahead of the lateral raises Monday is anchored to.
       */
      if (a.slot.role !== 'hypertrophy') return a.index - b.index

      // Heaviest first, so the work that most needs a fresh lifter gets one.
      const byCost = cost(b.slot) - cost(a.slot)
      if (byCost !== 0) return byCost

      // Ties keep the fill's order, which is the muscle-debt ordering —
      // the neediest muscle goes first among equals.
      return a.index - b.index
    })
    .map((entry) => entry.slot)
}

function addInto(target: VolumeMap, addition: VolumeMap): VolumeMap {
  const result = { ...target }
  for (const muscle of Object.keys(addition) as MuscleGroup[]) {
    result[muscle] += addition[muscle]
  }
  return result
}

export { rpFrequency }
