import { invariant } from '@/domain/errors/domain-error'
import { WARM_UPS } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { HYPERTROPHY_RPE } from '@/domain/exercises/loading'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { RtsPrescription } from '@/domain/framework/rts'
import { backoffStopRpe, DEFAULT_RTS } from '@/domain/framework/rts'
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
import { countsAsWorking, slotVolume, type VolumeMap } from '@/domain/volume/accounting'
import { requiredFrequency, setsPerSession } from '@/domain/volume/frequency'
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

  /*
   * Days on which a muscle was trained *directly*, counted apart from
   * days it merely received a fraction from something else.
   *
   * The frequency floor used to count any contribution at all, so the
   * upper back could read as trained five days a week — half a set at a
   * time from rows and chin-ups — while a barbell row appeared once. Half
   * credit is right for volume and wrong for frequency: a muscle is
   * trained on a day when something trained it.
   */
  const directDays = Object.fromEntries(
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
      directDays,
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

    for (const muscle of trainedDirectly([...slots, ...filled.slots], deps.exercises)) {
      directDays[muscle] += 1
    }

    slots.push(...filled.slots)
    slots.push(...conditioning)

    const ordered = inSessionOrder(slots, deps.exercises)

    days.push({
      index: dayIndex,
      ...describeDay(splitDay, ordered, deps.exercises, targets),
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

  /*
   * A fixed drop from today's top set, with no prescribed RPE.
   *
   * The RPE of a back-off is the *reading*, not the instruction: same
   * weight, same reps, and the effort climbs set over set as fatigue
   * accumulates until the implied max has fallen by the day's target.
   * Prescribing "RPE 7.5" said the opposite — lighten it until it feels
   * easy — and the number gave it away, suggesting a weight about 2%
   * below the top set on a slot labelled "Load drop 5%", because the
   * suggestion came from the RPE chart rather than from the drop.
   */
  const dropPercent = recipe.rts.method === 'load-drop' ? (recipe.rts.loadDropPercent ?? 5) : 0

  /*
   * The same stopping rule, in a unit you can act on.
   *
   * The rule is a fatigue percentage, and asking a lifter to compare two
   * implied maxes between sets is asking them to run the RPE chart twice
   * with chalk on their hands. Stated as "stop when a set hits RPE 8.5"
   * it is the same rule and needs no arithmetic — and it is knowable now
   * rather than in the gym, because the top set's weight cancels out.
   */
  const stopRpe = backoffStopRpe(recipe.rts.topSetReps, topSetRpe, dropPercent, fatigueTarget)

  const backoffs: SetPrescription[] = Array.from({ length: backoffCap }, (_unused, index) => ({
    load: {
      kind: 'rts-backoff' as const,
      dropPercent,
      topSetReps: recipe.rts.topSetReps,
      topSetRpe,
      ...(stopRpe !== undefined ? { stopRpe } : {}),
    },
    reps: { kind: 'fixed' as const, reps: recipe.rts.topSetReps },
    label: 'Back-off',
    ...(index === 0
      ? {
          notes:
            stopRpe === undefined
              ? `Log the RPE of each one. Stop when a set implies a max ${String(fatigueTarget)}% below the top set.`
              : `Same weight every set. Log the RPE — when one comes in at ${String(stopRpe)}, that is the ${String(fatigueTarget)}% drop and you are done.`,
        }
      : {}),
  }))

  /*
   * Two slots, not one, and they do different jobs.
   *
   * They were merged for a while on the reasoning that the top set and
   * its back-offs are the same exercise in the same trip to the rack.
   * True, and it hid the thing that makes RTS RTS: the top set is a
   * *measurement* the rest of the session is derived from, and the
   * back-offs are work whose number is not known in advance. One row
   * labelled "Strength" said neither, and the pair of them read as one
   * six-set prescription — which is exactly what a percentage program
   * would give you and exactly what this is not.
   *
   * They stay adjacent because the ordering pass is a stable sort and
   * both rank the same, so the top set is always the row above.
   */
  const top: Slot = {
    id: asSlotId(deps.ids.next()),
    role: 'strength',
    variant: 'Top set',
    exercise: { kind: 'specific', exerciseId },
    sets: [topSet],
    restSeconds: exercise.defaultRestSeconds ?? 180,
    notes: isDeload
      ? 'Deload — work up to something easy and stop.'
      : 'One set. What it weighs and how it felt is where every number below comes from.',
  }

  const backoff: Slot = {
    id: asSlotId(deps.ids.next()),
    role: 'strength',
    variant: 'Back-off',
    exercise: { kind: 'specific', exerciseId },
    sets: backoffs,
    restSeconds: exercise.defaultRestSeconds ?? 180,
    notes: isDeload
      ? 'Deload — one back-off, easy.'
      : `${describeMethod(recipe.rts)} · ${String(fatigueTarget)}% fatigue target. The set count is a cap, not a plan.`,
  }

  return {
    slots: [top, backoff],
    spent: addInto(slotVolume(exercise, top.sets), slotVolume(exercise, backoff.sets)),
  }
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
  /** Days so far on which each muscle was the *primary* muscle of a slot. */
  readonly directDays: Record<MuscleGroup, number>
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

  /** Places one pass of accessory work, neediest muscle first. */
  const fillFor = (muscles: readonly MuscleGroup[], ceiling: number): void => {
    const debts = muscles
      .map((muscle) => ({
        muscle,
        owed: shareOwed(muscle, args, addInto(committed, added)),
        /*
         * How far behind its *own* required frequency this muscle is.
         *
         * Not the raw day count. Comparing side delts on two direct days
         * against calves on two says they are equally served, when the
         * first is owed twenty-two sets and needs four sessions and the
         * second is owed seven and needs two. The deficit puts them in
         * the order the volume actually implies.
         */
        behind:
          requiredFrequency(args.targets[muscle], daysAvailableFor(muscle, args.split)) -
          args.directDays[muscle],
      }))
      .filter((entry) => entry.owed >= recipe.minSetsPerSlot)
      /*
       * Frequency first, then need.
       *
       * An upper day is accountable for nine muscles and has room for
       * six, so a purely need-ordered sort starves the same three every
       * session — and the ones it starves are exactly those the strength
       * work already paid, which is how chest ends up trained once a week
       * on a split built to train it twice. Splitting a weekly target
       * across fewer sessions than planned makes each one less
       * recoverable, which is the whole reason the target was split.
       */
      .sort((a, b) => (a.behind !== b.behind ? b.behind - a.behind : b.owed - a.owed))

    for (const { muscle, owed } of debts) {
      if (slots.length >= recipe.maxHypertrophySlotsPerDay) break
      // Out of time. What this day does not spend stays in the weekly
      // budget and is picked up by the sessions that follow.
      if (minutes >= ceiling) break

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
        variant: exercise.isCompound ? 'Compound' : 'Isolation',
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
      if (minutes + cost > ceiling && slots.length > 0) continue

      used.add(exercise.id)
      added = addInto(added, slotVolume(exercise, sets))
      minutes += cost
      placed.push(exercise)
      slots.push(slot)
    }
  }

  // What the day is *for* comes first and takes what it needs.
  fillFor(splitDay.muscles, recipe.targetSessionMinutes)

  /*
   * Then, and only then, whatever the other days could not hold.
   *
   * A second pass rather than more entries in the first, because the
   * ordering between the two is the whole point: a deadlift day fills
   * its legs and core, and reaches for the arms with the time it has
   * left. Merged into one list it was as entitled to a curl as Monday
   * was, which is how a heavy pull ended up followed by an upright row.
   *
   * Both passes share `minutes` and the slot cap, so the overflow can
   * only ever use room the day actually had.
   */
  fillFor(splitDay.overflowMuscles ?? [], recipe.targetSessionMinutes * OVERFLOW_CEILING)

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
   * this day is accountable for that would otherwise end the week short
   * of its required frequency gets one cheap slot.
   *
   * How short is "short" comes from the volume rather than a flat two —
   * see `domain/volume/frequency.ts`. A muscle owed four sets a week is
   * fine seeing them twice; one owed twenty-two is not, and the old floor
   * could not tell them apart.
   */
  const directToday = new Set(trainedDirectly(slots, deps.exercises))

  for (const muscle of splitDay.muscles) {
    if (directToday.has(muscle)) continue

    const needed = requiredFrequency(args.targets[muscle], daysAvailableFor(muscle, args.split))
    const daysLeftTrainingIt = args.remainingDays.filter((day) =>
      day.muscles.includes(muscle),
    ).length

    // Every session left could train it and it would still fall short, so
    // this one has to be one of them.
    if (args.directDays[muscle] + daysLeftTrainingIt >= needed) continue

    const exercise = pickHypertrophyExercise(args, muscle, used, placed)
    if (exercise === undefined) continue

    const count = fittableSets(exercise, recipe.minSetsPerSlot, recipe, addInto(committed, added))
    if (count < recipe.minSetsPerSlot) continue

    const sets = hypertrophySets(exercise, count)
    const slot: Slot = {
      id: asSlotId(deps.ids.next()),
      role: exercise.isCompound ? 'hypertrophy' : 'assistance',
      variant: exercise.isCompound ? 'Compound' : 'Isolation',
      exercise: { kind: 'specific', exerciseId: exercise.id },
      sets,
      restSeconds: exercise.defaultRestSeconds ?? 120,
      notes: `Frequency slot — this muscle needs ${String(needed)} sessions a week.`,
    }

    /*
     * The backfill may run a session over, but not without limit.
     *
     * It used to ignore the clock entirely, which was survivable while
     * the floor was two and it fired once or twice a week. Driven by
     * volume it fires often enough to matter, and a frequency floor that
     * turns a seventy-minute session into a hundred has traded one
     * recovery problem for another.
     */
    const cost = slotMinutes(slot)
    if (minutes + cost > recipe.targetSessionMinutes * BACKFILL_TIME_GRACE) continue

    used.add(exercise.id)
    added = addInto(added, slotVolume(exercise, sets))
    minutes += cost
    placed.push(exercise)
    directToday.add(exercise.primaryMuscle)
    slots.push(slot)
  }

  return { slots, spent: added }
}

/**
 * This day's share of what a muscle still owes for the week.
 *
 * The remaining weekly target divided by the sessions left that train it,
 * so no single day claims a budget the rest of the week needs — then
 * capped at the per-session dose the muscle's frequency implies.
 *
 * The cap is what stops the last accountable day of the week from
 * sweeping up whatever the earlier ones left. Without it a muscle that
 * was starved on Monday and Wednesday is handed nine sets on Friday, and
 * a week that reads as hitting its total is really one session of junk
 * volume wearing the total's clothes.
 */
function shareOwed(muscle: MuscleGroup, args: FillArgs, committed: VolumeMap): number {
  const sessionsLeft = 1 + args.remainingDays.filter((day) => day.muscles.includes(muscle)).length
  const share = Math.max(0, args.targets[muscle] - committed[muscle]) / Math.max(1, sessionsLeft)

  const dose = setsPerSession(
    args.targets[muscle],
    requiredFrequency(args.targets[muscle], daysAvailableFor(muscle, args.split)),
  )

  return Math.min(share, dose)
}

/** Minutes one slot costs: work plus rest, warm-ups rested through. */
function slotMinutes(slot: Slot): number {
  const rest = slot.restSeconds ?? 120
  return slot.sets.reduce((total, set) => total + setSeconds(set, rest), 0) / 60
}

/**
 * How far past its target session a frequency slot may push a day.
 *
 * Fifteen per cent: about one more accessory on a seventy-minute day.
 */
const BACKFILL_TIME_GRACE = 1.15

/**
 * Muscles a day trained *directly* — as the primary of some working slot.
 *
 * The distinction the frequency floor turns on. Half credit is the right
 * answer for volume and the wrong one for frequency: a row paying the
 * biceps half a set is real growth stimulus, and it is not a biceps
 * session. Counting it as one is how the upper back could read as trained
 * five days a week off a single barbell row.
 */
function trainedDirectly(
  slots: readonly Slot[],
  exercises: readonly Exercise[],
): readonly MuscleGroup[] {
  const direct = new Set<MuscleGroup>()

  for (const slot of slots) {
    // Warm-ups and conditioning are not what "trained today" means, and
    // neither earns volume credit anywhere else either.
    if (slot.role === 'warmup' || slot.role === 'conditioning') continue
    const ref = slot.exercise
    if (ref.kind !== 'specific') continue
    if (!slot.sets.some(countsAsWorking)) continue

    const exercise = exercises.find((candidate) => candidate.id === ref.exerciseId)
    if (exercise !== undefined) direct.add(exercise.primaryMuscle)
  }

  return [...direct]
}

/**
 * Above this rep ceiling a hypertrophy set is long enough to fail
 * safely; at or below it, failing is a max attempt wearing a rep range.
 */
const HEAVY_HYPERTROPHY_REPS = 6

/**
 * How much of a session borrowed work may fill.
 *
 * Three quarters, so a lower day that finishes its own legs in forty
 * minutes can take a couple of cheap arm slots and still be a lower day.
 * Left at the full target the overflow ran a squat day to seventy-nine
 * minutes on an upright row, a skullcrusher, a wrist curl and a barbell
 * curl — which is the arm workout stapled to a leg day that separating
 * the two lists was supposed to prevent.
 */
const OVERFLOW_CEILING = 0.75

/** Sessions in the whole week's split that are accountable for a muscle. */
function daysAvailableFor(muscle: MuscleGroup, split: RpSplit): number {
  return split.days.filter((day) => day.muscles.includes(muscle)).length
}

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
 * failing is neither dangerous nor disproportionately expensive, and only
 * where the set is long enough that failing it is not a max attempt.
 */
function hypertrophySets(exercise: Exercise, count: number): readonly SetPrescription[] {
  const range = exercise.defaultRepRange ?? { low: 8, high: 12 }

  /*
   * A heavy set of three is a single by another name once you fail it.
   *
   * The overhead press ran 3–6 and carried both the note "one rep in
   * reserve, not a max" and a last set prescribed at RPE 10 — two
   * instructions that contradict each other on the same slot. Failing a
   * top-heavy triple costs what a max costs and returns hypertrophy's
   * worth of stimulus, which is the wrong side of that trade.
   */
  const tooHeavyToFail = range.high <= HEAVY_HYPERTROPHY_REPS

  return Array.from({ length: count }, (_unused, index) => {
    const isLast = index === count - 1
    const toFailure = isLast && exercise.safeToFail && !tooHeavyToFail

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
        // Which half of the body it prepares. Not inferable from the
        // exercise — shoulder dislocations open an upper day and foam
        // rolling a lower one, and the routine is a property of the day.
        variant: day.warmUp === 'upper' ? 'Upper' : 'Lower',
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

    const plan = CONDITIONING_PLANS[slug] ?? {
      minutes: 15,
      style: 'Zone 2',
      note: 'Easy, conversational pace.',
    }
    // A deload cuts conditioning the same way it cuts everything else.
    // Leaving it at full duration would make the deload week the hardest
    // conditioning week of the block.
    const minutes = isDeload ? Math.max(10, Math.round(plan.minutes / 2)) : plan.minutes

    return [
      {
        id: asSlotId(deps.ids.next()),
        role: 'conditioning',
        /*
         * The intensity domain, which is the only thing about a
         * conditioning slot you need before starting it and the thing
         * neither its duration nor its effort note says.
         *
         * There are two of these, not three. LISS and Zone 2 are the
         * same work under two names, so an incline walk and an easy run
         * carry the same label — the walk costs less, but that is
         * systemic cost, which the exercise already models separately,
         * not a different intensity domain.
         */
        variant: plan.style,
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
const CONDITIONING_PLANS: Readonly<
  Record<string, { minutes: number; note: string; style: string }>
> = {
  'incline-walk': {
    minutes: 20,
    style: 'Zone 2',
    note: 'Steep incline, easy pace. You should be able to hold a conversation.',
  },
  running: {
    minutes: 25,
    style: 'Zone 2',
    note: 'Steady aerobic pace — this is the base-building run, not a test.',
  },
  'kb-swing': {
    minutes: 12,
    style: 'HIIT',
    note: 'Intervals: 30 seconds hard, 30 seconds rest. Hips, not arms.',
  },
}

/**
 * A day named after what is actually in it.
 *
 * "Monday — press and pull" was written into the split, which made it a
 * claim rather than a description: move a tier and the fill changes
 * underneath the label, and the session on screen stops matching the
 * words above it. Reading the name off the finished slots means it cannot
 * be wrong.
 *
 * Two lines, because a session has two things worth knowing and they are
 * wanted at different moments — see {@link ProgramDay.focus}.
 */
function describeDay(
  splitDay: RpDay,
  slots: readonly Slot[],
  library: readonly Exercise[],
  targets: Record<MuscleGroup, number>,
): { readonly label: string; readonly focus?: string } {
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  /*
   * Direct and indirect work counted apart, because they are what the
   * two halves of the name distinguish.
   *
   * Merging them named an upper day after the core: pull-ups pay it a
   * fraction, and the core's weekly target is small enough for that
   * fraction to dominate. It is a real contribution and it is not what
   * the day is for, which is exactly the distinction being drawn.
   */
  const direct = emptyVolumeMap()
  const indirect = emptyVolumeMap()

  let strengthName: string | undefined
  let hasStrength = false
  let hasHypertrophy = false
  let hasConditioning = false

  for (const slot of slots) {
    if (slot.role === 'conditioning') hasConditioning = true
    if (slot.exercise.kind !== 'specific') continue
    const exercise = lookup(slot.exercise.exerciseId)
    if (exercise === undefined) continue

    if (slot.role === 'strength') {
      strengthName = exercise.name
      hasStrength = true
    }
    if (slot.role === 'hypertrophy' || slot.role === 'assistance') hasHypertrophy = true
    if (slot.role === 'warmup' || slot.role === 'conditioning') continue

    const working = slot.sets.filter(countsAsWorking).length
    if (working === 0) continue

    direct[exercise.primaryMuscle] += working
    for (const muscle of exercise.secondaryMuscles) {
      if (muscle === exercise.primaryMuscle) continue
      indirect[muscle] += working * SECONDARY_SET_FRACTION
    }
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
  const rank = (volume: VolumeMap, exclude: ReadonlySet<MuscleGroup>, limit: number) =>
    (Object.keys(volume) as MuscleGroup[])
      .filter((muscle) => volume[muscle] > 0 && !exclude.has(muscle))
      .sort((a, b) => volume[b] / Math.max(1, targets[b]) - volume[a] / Math.max(1, targets[a]))
      .slice(0, limit)

  /*
   * Every muscle with direct work is named — no cap.
   *
   * Capping at the top few dropped the biceps off a day containing
   * pull-ups and curls, because the day gave them two sets out of a
   * nineteen-set week and four other muscles had a larger share. Ranking
   * by share is right and truncating by it is not: a reader who can see
   * a curl in the session and no biceps in the description has found a
   * bug, whether or not the arithmetic behind it was sound.
   */
  const primary = rank(direct, new Set(), Number.POSITIVE_INFINITY)

  /*
   * The incidental list stays short. It is an aside, and every exercise
   * pays something to three or four muscles — naming all of them would
   * make the sentence a table again.
   */
  const secondary = rank(indirect, new Set(primary), 3)

  /*
   * The lift keeps its own capitalisation. The parenthetical variant is
   * dropped: "Low Bar Squat", not "Low Bar Squat (competition)".
   */
  const lift = strengthName?.replace(/\s*\([^)]*\)\s*/g, '').trim()

  /*
   * What kind of session it is — the headline, named from the roles
   * actually present rather than from what the split meant to put there.
   *
   * This is the first thing worth knowing about a day and it used to be
   * buried on the second line behind a list of muscles. "Is today a
   * strength day" is answered by three words; which muscles those three
   * words imply is a longer answer that belongs underneath.
   *
   * Each kind is capitalised and the conjunction is not: they are the
   * names of the three sorts of work this app does, and "and" is not one
   * of them.
   */
  const kinds = [
    hasStrength ? 'Strength' : '',
    hasHypertrophy ? 'Hypertrophy' : '',
    hasConditioning ? 'Conditioning' : '',
  ].filter((kind) => kind !== '')

  /*
   * The detail line, written as sentences rather than as delimited
   * fields.
   *
   * "Strength and hypertrophy · Quads, Core, Calves · indirect: Glutes"
   * is a record laid out for a machine to have produced. Muscles keep
   * ordinary sentence case here — they are common nouns, and the lift
   * beside them is a proper one, so the capitals now mark a real
   * distinction instead of being applied to everything equally.
   */
  const names = (muscles: readonly MuscleGroup[]): string =>
    joinAnd(muscles.map((muscle) => MUSCLE_GROUP_LABELS[muscle].toLowerCase()))

  const trains = primary.length > 0 ? names(primary) : undefined

  const opening =
    lift !== undefined && trains !== undefined
      ? `${lift}, then ${trains}.`
      : lift !== undefined
        ? `${lift}.`
        : trains !== undefined
          ? `${sentenceCase(trains)}.`
          : undefined

  const aside = secondary.length > 0 ? `Some ${names(secondary)}.` : undefined

  const focus = [opening, aside].filter((part): part is string => part !== undefined).join(' ')

  return {
    label: kinds.length > 0 ? `${splitDay.label} — ${joinAnd(kinds)}` : splitDay.label,
    ...(focus !== '' ? { focus } : {}),
  }
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** "a", "a and b", "a, b and c" — an Oxford-comma-free list. */
function joinAnd(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1] ?? ''}`
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
