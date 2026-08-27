import { invariant } from '@/domain/errors/domain-error'
import { STRENGTH_VARIATIONS, WARM_UPS } from '@/domain/exercises/catalogue'
import type { Exercise } from '@/domain/exercises/exercise'
import { HYPERTROPHY_RPE } from '@/domain/exercises/loading'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUP_LABELS } from '@/domain/exercises/taxonomy'
import type { RtsPrescription } from '@/domain/framework/rts'
import { BACKOFF_VARIANT, TOP_SET_VARIANT } from '@/domain/framework/replan-backoffs'
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
import { DEFAULT_PROGRAM_SETTINGS } from '@/domain/programs/program'
import type { LiftSessions, StrengthLift } from '@/domain/priority/tiers'
import {
  DEFAULT_LIFT_SESSIONS,
  strengthSessionsFor,
  STRENGTH_LIFTS,
  validateLiftSessions,
} from '@/domain/priority/tiers'
import { describeBlock } from '@/domain/priority/explain'
import type { RpDay, RpSplit } from '@/domain/splits/rp-splits'
import { rpFrequency, rpSplitForDays } from '@/domain/splits/rp-splits'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import { countsAsWorking, slotVolume, type VolumeMap } from '@/domain/volume/accounting'
import {
  MAX_DIRECT_SETS_PER_SESSION,
  requiredFrequency,
  setsPerSession,
} from '@/domain/volume/frequency'
import { emptyVolumeMap } from '@/domain/volume/landmarks'
import type { MuscleVolumes, SetsPerSession } from '@/domain/volume/levels'
import {
  DEFAULT_MUSCLE_VOLUMES,
  DEFAULT_SETS_PER_SESSION,
  setsPerSessionFor,
  validateMuscleVolumes,
  validateSetsPerSession,
  weeklySetsFor,
} from '@/domain/volume/levels'

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
  readonly liftSessions: LiftSessions
  readonly muscleVolumes: MuscleVolumes
  readonly setsPerSession: SetsPerSession
  readonly daysPerWeek: number
  readonly weeksBeforeDeload: number
  readonly rts: RtsPrescription
  readonly includeWarmUps: boolean
  /**
   * Roughly how long a session should run.
   *
   * A real constraint, not a hint. Volume targets alone do not distribute
   * evenly across days — the day carrying the featured lift and the big
   * pulls claims the shared small-muscle budget first simply because it is
   * built first, and the last day of the week gets the leftovers. Capping
   * the fill by projected duration is what makes the *week* balanced
   * rather than just the totals.
   *
   * Not a setting any more. It was one, and it read as a dial for how
   * long you wanted to train — which it never was: raising it does not
   * make a session longer, it only stops holding the first day back
   * from spending the last day's budget. A number whose apparent
   * meaning is the opposite of its real one is worse in the UI than
   * out of it.
   */
  readonly minSetsPerSlot: number
  readonly maxSetsPerSlot: number
  readonly excludedExercises: readonly ExerciseId[]
  readonly settings: ProgramSettings
}

/** The ceiling a day's fill is costed against. See {@link RpRecipe}. */
/*
 * There is no session length, minimum or maximum.
 *
 * A ceiling of seventy minutes lived here. It was defended as a recovery
 * budget rather than a clock — "one day must not claim the whole week" —
 * and that reading stopped being true once a muscle's weekly target was
 * itself clamped to what its tier's frequency can deliver. The target is
 * the recovery budget now, and the ceiling was a second one applied on
 * top: a day could satisfy every landmark it was accountable for and be
 * cut off mid-fill anyway.
 *
 * What it actually cost is worth writing down, because "a cap nobody
 * reaches" is how it read right up until the split changed. Two upper
 * days with nine tier-2 muscles ran out of clock at six accessory slots,
 * so the side delts and the triceps got one session where their tier
 * asked for two — a training decision made by a constant, invisible on
 * every screen, and unreachable by any setting.
 *
 * The day is now as long as the volume asked for, and nothing bounds it
 * except the arithmetic that produced the volume. That is not unbounded:
 * one exercise per muscle per session times five sets is the ceiling, and
 * the muscle list a day carries is fixed by the split. If a session comes
 * out too long the answer is fewer muscles at tier 2 or more days —
 * decisions a person makes and can see — rather than a number here
 * quietly declining to schedule the last two.
 */

export function defaultRpRecipe(overrides: Partial<RpRecipe> = {}): RpRecipe {
  const muscleVolumes = overrides.muscleVolumes ?? DEFAULT_MUSCLE_VOLUMES
  const liftSessions = overrides.liftSessions ?? DEFAULT_LIFT_SESSIONS
  const setsPerSession = overrides.setsPerSession ?? DEFAULT_SETS_PER_SESSION

  // Named and described from the tiers rather than by hand, so the block
  // cannot go on calling itself an arms specialisation after the arms
  // have been moved down.
  const described = describeBlock(muscleVolumes, setsPerSession, liftSessions)

  return {
    name: described.name,
    description: described.description,
    liftSessions,
    muscleVolumes,
    setsPerSession,
    // Five, matching `DEFAULT_SETTINGS`. Four has to carry the week's
    // volume in four sittings and runs the upper days long; six divides
    // it so finely that several sessions are not worth the trip.
    daysPerWeek: DEFAULT_DAYS_PER_WEEK,
    weeksBeforeDeload: DEFAULT_WEEKS_BEFORE_DELOAD,
    rts: DEFAULT_RTS,
    includeWarmUps: true,
    minSetsPerSlot: 3,
    /*
     * Three to five sets of one exercise, or the muscle is not trained
     * today.
     *
     * These now agree with `MAX_DIRECT_SETS_PER_SESSION` rather than
     * bounding something separate, because one exercise per muscle per
     * session makes the slot and the muscle's session dose the same
     * thing. Keep them in step: a `maxSetsPerSlot` below the per-session
     * ceiling would make that ceiling unreachable, and one above it would
     * be decorative — `shareOwed` takes the lower of the two.
     *
     * The floor is three rather than one, which is the load-bearing half.
     * A one-set slot costs a warm-up and a machine and delivers almost
     * nothing, and the fill will happily produce a dozen of them to make
     * an arithmetic total come out — thirteen exercises inside the minute
     * budget, which is the shape splitting the volume was meant to
     * avoid. Below three the muscle waits for a session that can do it
     * properly, and the Plan screen reports the shortfall.
     *
     * The old value was eight, under a comment claiming it matched the
     * per-session ceiling. It matched an older value of it and had been
     * decorative for some time.
     */
    maxSetsPerSlot: MAX_DIRECT_SETS_PER_SESSION,
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
  validateMuscleVolumes(recipe.muscleVolumes)
  validateSetsPerSession(recipe.setsPerSession)
  validateLiftSessions(recipe.liftSessions)
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
    weeks.push(buildWeek(recipe, deps, split, weekIndex, isDeload))
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
  isDeload: boolean,
): ProgramWeek {
  /*
   * Strength work first, for the whole week, before any hypertrophy is
   * chosen. The competition lifts are fixed and they pay several muscles
   * at once — a squat is quads, glutes, hamstrings and core — so filling
   * day by day would let Monday's accessories spend a budget Thursday's
   * deadlift is going to need.
   */
  const liftsByDay = assignStrengthLifts(split, recipe.liftSessions)

  /*
   * How many times each lift has already appeared this week, so a lift
   * can rotate through its variations. Counted as the days are walked
   * rather than derived from the day index, because the bench's three
   * sessions are its first, second and third whichever days they land on.
   */
  const sessionsSoFar = new Map<StrengthLift, number>()

  const strengthByDay = split.days.map((_day, index) => {
    const built = (liftsByDay[index] ?? []).map((lift) => {
      const session = sessionsSoFar.get(lift) ?? 0
      sessionsSoFar.set(lift, session + 1)
      return buildStrengthSlots(recipe, deps, lift, session, isDeload)
    })
    return {
      slots: built.flatMap((one) => one.slots),
      spent: built.reduce<VolumeMap>((total, one) => addInto(total, one.spent), emptyVolumeMap()),
    }
  })
  const strengthWeekSpend = strengthByDay.reduce<VolumeMap>(
    (total, built) => addInto(total, built.spent),
    emptyVolumeMap(),
  )

  const targets = weeklyTargets(recipe, isDeload)

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
  const daysTrained = Object.fromEntries(MUSCLE_GROUPS.map((muscle) => [muscle, 0])) as Record<
    MuscleGroup,
    number
  >

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
  const directDays = Object.fromEntries(MUSCLE_GROUPS.map((muscle) => [muscle, 0])) as Record<
    MuscleGroup,
    number
  >

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
      isDeload,
    })

    committed = addInto(committed, filled.spent)

    // This day's work — strength and hypertrophy together — counts once
    // per muscle toward frequency.
    const dayTotal = addInto(strength?.spent ?? emptyVolumeMap(), filled.spent)
    for (const muscle of Object.keys(dayTotal) as MuscleGroup[]) {
      if (dayTotal[muscle] > 0) daysTrained[muscle] += 1
    }

    /*
     * The day's own target, kept for the session to measure against.
     *
     * `dayTotal` is what this day planned to deliver — the strength work
     * plus the fill — which is the right number precisely because it is
     * the one the assembler used. Recomputing it in the player would mean
     * reproducing how a weekly target is shared across the days that
     * remain, and a second implementation of that would drift.
     *
     * Restricted to muscles the day trains *directly*. Everything else it
     * pays incidentally, and a lifter asking "am I done" between sets
     * wants the two or three the session is for, not a table of fifteen.
     */
    const dayDirect = trainedDirectly([...slots, ...filled.slots], deps.exercises)
    const volumeTargets: Partial<Record<MuscleGroup, number>> = {}

    for (const muscle of dayDirect) {
      directDays[muscle] += 1
      if (dayTotal[muscle] > 0) volumeTargets[muscle] = Number(dayTotal[muscle].toFixed(1))
    }

    slots.push(...filled.slots)
    slots.push(...conditioning)

    const ordered = inSessionOrder(slots, deps.exercises, recipe.muscleVolumes)

    days.push({
      index: dayIndex,
      ...describeDay(splitDay, ordered, deps.exercises, targets),
      slots: ordered,
      volumeTargets,
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

/** Each muscle's weekly set target: the same one every working week. */
function weeklyTargets(recipe: RpRecipe, isDeload: boolean): Record<MuscleGroup, number> {
  const targets = {} as Record<MuscleGroup, number>

  for (const muscle of MUSCLE_GROUPS) {
    targets[muscle] = weeklySetsFor(recipe.muscleVolumes[muscle], recipe.setsPerSession, isDeload)
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

/**
 * Which version of a lift this session trains.
 *
 * `session` is the ordinal of this lift's appearance in the week, not the
 * day index — the bench is on Monday, Wednesday and Friday, so its
 * sessions are 0, 1, 2 whatever days those turn out to be. Modulo, so a
 * lift with one variation is unaffected and a rotation shorter than the
 * frequency repeats rather than falling off the end.
 *
 * The competition version is index 0, so a lift trained once a week gets
 * it: a rotation must never cost a single-session lift the thing the
 * total is measured on.
 */
function strengthSlugFor(lift: StrengthLift, session: number): string {
  const variations = STRENGTH_VARIATIONS[lift]
  return variations[session % variations.length] ?? variations[0] ?? ''
}

/** Which half of the body a competition lift belongs to. */
const STRENGTH_REGION: Record<StrengthLift, 'upper' | 'lower'> = {
  squat: 'lower',
  bench: 'upper',
  deadlift: 'lower',
}

/**
 * Which competition lifts open each day of the week.
 *
 * Derived from the tiers rather than written into the split, so
 * promoting a lift changes how often it is trained without anyone
 * editing a day. A prioritised bench is benched three times a week
 * because that is what tier 1 means — see `strengthSessionsFor`.
 *
 * Sessions are spread across the eligible days rather than crowded into
 * the first ones: two squat sessions in a five-day week want Tuesday and
 * Thursday, not Tuesday and Tuesday-again.
 */
function assignStrengthLifts(
  split: RpSplit,
  liftSessions: LiftSessions,
): readonly (readonly StrengthLift[])[] {
  const perDay: StrengthLift[][] = split.days.map(() => [])

  for (const lift of STRENGTH_LIFTS) {
    const region = STRENGTH_REGION[lift]
    const eligible = split.days.flatMap((day, index) =>
      (day.carries ?? []).includes(region) ? [index] : [],
    )
    if (eligible.length === 0) continue

    const wanted = Math.min(eligible.length, strengthSessionsFor(liftSessions, lift))

    for (let session = 0; session < wanted; session += 1) {
      /*
       * The emptiest eligible day, not an evenly spaced index.
       *
       * Spacing each lift's own sessions across its own eligible days
       * reads as the obvious thing and is wrong as soon as two lifts
       * share a pool: a squat and a deadlift wanting one session each
       * from the same two lower days both computed index zero and landed
       * on Tuesday, leaving Thursday with no competition lift at all.
       * Choosing by how loaded a day already is spreads *lifts* rather
       * than spreading each lift independently.
       */
      const at = eligible
        .filter((index) => !perDay[index]?.includes(lift))
        .sort((a, b) => (perDay[a]?.length ?? 0) - (perDay[b]?.length ?? 0) || a - b)[0]

      if (at !== undefined) perDay[at]?.push(lift)
    }
  }

  /*
   * When a day hosts two competition lifts, alternate which one opens it.
   *
   * A tier-2 squat and a tier-2 deadlift both want two sessions and there
   * are only two lower days, so they share both. Left alone the order is
   * whatever `STRENGTH_LIFTS` happens to list, which means the same lift
   * opens fresh every time and the other one is always second, always
   * after five heavy sets. Over a block that is not a small difference —
   * the second lift never gets a session where it is the priority.
   *
   * Alternating is counted across the days that actually hold a pair
   * rather than by day index, so the two lower days swap even when they
   * are Tuesday and Thursday with an untouched Wednesday between them.
   *
   * Deterministic, which matters: assembly must produce a byte-identical
   * program for the same settings, and a workout in progress refers to
   * its sets by index.
   */
  let paired = 0
  return perDay.map((lifts) => {
    if (lifts.length < 2) return lifts

    paired += 1
    return paired % 2 === 0 ? [...lifts].reverse() : lifts
  })
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
  lift: StrengthLift,
  session: number,
  isDeload: boolean,
): BuiltSlots {
  const exerciseId = asExerciseId(strengthSlugFor(lift, session))
  const exercise = deps.exercises.find((candidate) => candidate.id === exerciseId)
  if (exercise === undefined) return { slots: [], spent: emptyVolumeMap() }

  /*
   * The allowance equals the load drop, for every lift, every session.
   *
   * That equality is the whole point. Stop when the implied max has
   * fallen by the drop you took, and — because at matched reps and RPE
   * an implied max is proportional to bar weight — that is exactly the
   * moment the lighter bar feels like the top set did. One sentence, no
   * arithmetic, true on every lift: *drop five per cent and keep going
   * until it feels like your opener again.*
   *
   * It used to vary by tier, 2% up to 7%, which is a coherent way to
   * spend a prioritisation and made that sentence false for every tier
   * but one. Priority now buys **frequency** instead, which is visible on
   * the calendar rather than buried in a stopping rule.
   */
  const fatigueTarget = isDeload ? 0 : (recipe.rts.loadDropPercent ?? 5)

  const topSetRpe = isDeload ? 6 : recipe.rts.topSetRpe

  const topSet: SetPrescription = {
    load: { kind: 'rpe', target: topSetRpe },
    reps: { kind: 'fixed', reps: recipe.rts.topSetReps },
    label: 'Top set',
    notes: `Work up until this feels like RPE ${String(topSetRpe)}.`,
  }

  /*
   * A flat cap, because every session now has the same shape.
   *
   * The stopping rule is what ends the block; this only stops a session
   * running away when the opener was called too light. It is
   * materialised as slots and counted as volume, so it should sit near
   * where the rule usually fires rather than at the theoretical maximum.
   */
  const backoffCap = isDeload ? 1 : Math.min(recipe.rts.maxBackoffSets, STRENGTH_BACKOFF_CAP)

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
    variant: TOP_SET_VARIANT,
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
    variant: BACKOFF_VARIANT,
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
  /** A deload sheds fatigue; the frequency floor does not apply. */
  readonly isDeload: boolean
}

function fillHypertrophy(args: FillArgs): BuiltSlots {
  const { recipe, deps, splitDay, committed } = args

  const used = new Set(args.alreadyUsed)
  const slots: Slot[] = []
  const placed: Exercise[] = []

  /*
   * Seeded with what the day has *already* delivered, not with nothing.
   *
   * "Adjusted for partial volume within the session" has to mean the
   * whole session, and the competition lifting is the largest part of
   * it: a Monday bench pays the chest about six credited sets before any
   * accessory is chosen. Starting this at zero told the fill the chest
   * was untouched, so it added its full share on top and Monday went out
   * at nine against a share of 5.7 — while the muscles sorted below it
   * got whatever minutes were left.
   *
   * The weekly `committed` map already counts the same work, but a
   * weekly figure divided by sessions gives back only a third of it.
   * Today's spend has to come off today.
   */
  let added = args.existingSlots.reduce((total, slot) => {
    const ref = slot.exercise
    if (ref.kind !== 'specific') return total
    const exercise = deps.exercises.find((candidate) => candidate.id === ref.exerciseId)
    if (exercise === undefined) return total
    return addInto(total, slotVolume(exercise, slot.sets))
  }, emptyVolumeMap())

  /**
   * The smallest slot this muscle may get.
   *
   * Three sets normally, and never more than the settings say a session
   * holds — a floor above the ask is a floor that schedules nothing.
   *
   * The deload is what forced this to be written down. Its sets-per-
   * session is two, so a flat floor of three meant no accessory work
   * could be placed at all and a deload delivered zero rather than two.
   * Zero is a defensible deload; it is not the one that was configured,
   * and the gap between those two is exactly the kind of thing a constant
   * decides silently.
   */
  const floorFor = (muscle: MuscleGroup): number =>
    Math.min(
      recipe.minSetsPerSlot,
      setsPerSessionFor(recipe.muscleVolumes[muscle].level, recipe.setsPerSession, args.isDeload),
    )

  /** Places one pass of accessory work, neediest muscle first. */
  const fillFor = (
    muscles: readonly MuscleGroup[],
    options: { readonly compoundsOnly?: boolean } = {},
  ): void => {
    const debts = muscles
      .map((muscle) => ({
        muscle,
        owed: shareOwed(muscle, args, committed, added),
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
          requiredFrequency(
            args.recipe.muscleVolumes[muscle].sessionsPerWeek,
            daysAvailableFor(muscle, args.split),
          ) - args.directDays[muscle],
      }))
      .filter((entry) => entry.owed >= floorFor(entry.muscle))
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

    for (const { muscle } of debts) {
      /*
       * Re-asked here rather than reused from the sort above.
       *
       * The order is decided once for the whole pass, which is right — it
       * is a ranking, and re-ranking mid-pass would let a muscle jump the
       * queue after another was placed. The *size* is a different
       * question and has to see what the pass has already done: a slot
       * chosen for the lats pays the biceps on the way past, and a curl
       * sized against the state at the top of the pass spends that credit
       * twice.
       */
      const owed = shareOwed(muscle, args, committed, added)
      if (owed <= 0) continue

      const exercise = pickHypertrophyExercise(args, muscle, used, placed)
      if (exercise === undefined) continue
      // The compound pass skips anything that trains one muscle: it is
      // budgeting the work that pays several, and isolation gets the
      // remainder on the pass that follows.
      if (options.compoundsOnly === true && !exercise.isCompound) continue

      const setCount = fittableSets(
        exercise,
        Math.min(recipe.maxSetsPerSlot, Math.round(owed)),
        args.targets,
        addInto(committed, added),
      )
      if (setCount < floorFor(muscle)) continue

      const sets = hypertrophySets(exercise, setCount)

      const slot: Slot = {
        id: asSlotId(deps.ids.next()),
        role: exercise.isCompound ? 'hypertrophy' : 'assistance',
        variant: exercise.isCompound ? 'Compound' : 'Isolation',
        exercise: { kind: 'specific', exerciseId: exercise.id },
        sets,
        restSeconds: exercise.defaultRestSeconds ?? 120,
        notes: 'Last set to failure; the rest at one rep in reserve.',
      }

      used.add(exercise.id)
      added = addInto(added, slotVolume(exercise, sets))
      placed.push(exercise)
      slots.push(slot)
    }
  }

  /*
   * One pass, over the muscles the day is accountable for.
   *
   * There was a second pass here — an "overflow" list a leg day would
   * pick up once its own work was done, so the upper volume the three
   * upper days could not hold landed somewhere. It balanced the numbers
   * and produced sessions nobody would write: a curl and an upright row
   * after a heavy deadlift, present because the arithmetic needed a home
   * for them.
   *
   * A day either owns a muscle or it does not. The lopsidedness that
   * motivated the overflow is answered in the split instead — the
   * deadlift day is a pull day and the back belongs on it — and what
   * still does not fit is reported on the Plan screen rather than tucked
   * into whichever session had a gap.
   */
  /*
   * Compounds first, then everything.
   *
   * Two passes over the same muscles, the first restricted to compound
   * movements. A compound pays two or three muscles at once, and a fill
   * that sizes isolation before it has decided on the compounds spends
   * that incidental credit twice: Monday sized six curl sets against an
   * unpaid biceps target, then placed chin-ups for the lats which paid
   * the biceps another two and a half. The day delivered eight and a half
   * against a fair share of under six, and Wednesday — the crowded day —
   * got what was left.
   *
   * Budgeting the multi-muscle work first means the isolation pass sees
   * what has already been paid and fills the gap rather than the whole
   * target. It also matches how the session is performed: `inSessionOrder`
   * puts compounds before isolation for an unrelated reason, and having
   * the fill agree removes a mismatch between what is chosen and when.
   */
  fillFor(splitDay.muscles, { compoundsOnly: true })
  fillFor(splitDay.muscles)

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

  /*
   * Neediest first, not declaration order.
   *
   * This loop used to walk `splitDay.muscles` in the order the array was
   * written, and the array is grouped by region — the side delts sit last
   * in `UPPER` because that is a tidy way to write a list, not because
   * they matter least. So the one muscle with the largest target in the
   * whole program was the last one the backfill considered, and on a day
   * with a bench press in it the grace period was gone by the time its
   * turn came. It finished a block on ten of twenty sets while a
   * maintained chest was collecting a second session.
   *
   * Ordered by the same deficit the main fill uses, so the two passes
   * cannot disagree about who needs the work most.
   */
  /*
   * Not on a deload, and this cost a week to find.
   *
   * The backfill places at the three-set floor, because a slot cannot be
   * smaller than one. On a working week that rounds an ask of five up to
   * six across two sessions, which is the floor being honest about the
   * smallest useful dose. On a deload it does something else entirely: the
   * target is MV, the main fill correctly declines to open a two-set slot,
   * and the backfill then puts three sets on both upper days anyway — so
   * the biceps came out at six in the deload and six in the peak week, and
   * the deload was not one.
   *
   * A deload sheds fatigue. Frequency is a means to volume and never a
   * goal, and on the one week where the goal is *less* volume, a floor
   * that only ever adds has no business firing.
   */
  if (args.isDeload) return { slots, spent: added }

  const backfillOrder = [...splitDay.muscles].sort((a, b) => {
    const behind = (muscle: MuscleGroup): number =>
      requiredFrequency(
        args.recipe.muscleVolumes[muscle].sessionsPerWeek,
        daysAvailableFor(muscle, args.split),
      ) - args.directDays[muscle]

    if (behind(a) !== behind(b)) return behind(b) - behind(a)
    return args.targets[b] - args.targets[a]
  })

  for (const muscle of backfillOrder) {
    if (directToday.has(muscle)) continue

    /*
     * Frequency is how a target gets spread, not a target of its own.
     *
     * A muscle already at its weekly volume has nothing left to spread,
     * and scheduling it anyway buys fatigue and no stimulus. The floor
     * of two sessions was being applied to the front delts — asking for
     * three sets a week while the bench press and dips paid them ten —
     * so every Friday got an overhead press to satisfy an arithmetic
     * minimum for a muscle that was already at three times its target.
     *
     * Checked against what the week has *committed*, secondary credit
     * included, because that is what the muscle actually receives.
     */
    const stillOwed = args.targets[muscle] - addInto(committed, added)[muscle]
    if (stillOwed <= 0) continue

    const needed = requiredFrequency(
      args.recipe.muscleVolumes[muscle].sessionsPerWeek,
      daysAvailableFor(muscle, args.split),
    )
    const daysLeftTrainingIt = args.remainingDays.filter((day) =>
      day.muscles.includes(muscle),
    ).length

    // Every session left could train it and it would still fall short, so
    // this one has to be one of them.
    if (args.directDays[muscle] + daysLeftTrainingIt >= needed) continue

    const exercise = pickHypertrophyExercise(args, muscle, used, placed)
    if (exercise === undefined) continue

    const count = fittableSets(
      exercise,
      recipe.minSetsPerSlot,
      args.targets,
      addInto(committed, added),
    )
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
     * Nothing gates this on time or on a slot count any more.
     *
     * Both gates were here, and between them the backfill could decline
     * to give a muscle the session its tier had bought — which is the one
     * thing the backfill exists to prevent. What bounds it now is the
     * thing that should: it runs once over the muscles the day is
     * accountable for, skips any already trained today, and skips any
     * already at its weekly target. A day cannot exceed one exercise per
     * muscle it carries.
     *
     * The three-set floor is what the slot grace was really protecting
     * against. Thirteen exercises of two sets is a worse session than six
     * of four, and `minSetsPerSlot` bars it directly rather than by
     * limiting how many exercises may exist.
     */
    used.add(exercise.id)
    added = addInto(added, slotVolume(exercise, sets))
    placed.push(exercise)
    directToday.add(exercise.primaryMuscle)
    slots.push(slot)
  }

  /*
   * No padding pass, and deliberately none.
   *
   * A minimum session length used to be enforced here, and satisfying it
   * took three separate mechanisms: a grace period letting the frequency
   * backfill overrun, a top-up pass that scheduled muscles already at
   * their weekly target, and a loop that lengthened existing slots one
   * set at a time. All of it existed to move a thirty-nine minute
   * session to forty-one, and each piece had to be reasoned about again
   * every time anything else moved.
   *
   * A short day is information, not a defect. A deadlift session with
   * the legs on maintenance runs forty minutes because that is what the
   * tiers asked for, and the Plan screen already reports what the week
   * does and does not deliver.
   */
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
function shareOwed(
  muscle: MuscleGroup,
  args: FillArgs,
  committed: VolumeMap,
  addedToday: VolumeMap,
): number {
  /*
   * What is left, divided evenly among the sessions that still train it.
   *
   * A fixed `target / frequency` share is the cleaner-sounding rule and
   * is worse in practice, which is worth recording because it will be
   * proposed again. It spreads the *plan* evenly and then has no way to
   * absorb an error: a day that over-delivers — usually because a
   * compound paid the muscle after its isolation slot was already sized
   * — leaves the whole overshoot sitting on the last session, and the
   * biceps came out 7.5 / 5.5 / 3. Dividing the remainder spreads that
   * error across every session that follows instead: 5.5 / 6 / 5.5.
   *
   * The important thing is what it does *not* depend on. Sessions left
   * is a count of days that train this muscle, not a measure of how long
   * any of them ran. Two sessions with the same muscles get the same
   * share whether one of them finished in forty minutes and the other in
   * eighty.
   */
  /*
   * A deload keeps the muscle's own frequency.
   *
   * It used to collapse to one session, which was right when a deload
   * target was a weekly total of two sets — spreading two sets over two
   * days asks for one each, under any sensible slot, and scheduled
   * nothing. The deload is now stated *per session*, so the frequency is
   * already accounted for and overriding it here would deliver the whole
   * week in one sitting. It did: four sets on Monday and nothing on
   * Thursday, for a setting that reads "two sets per session".
   */
  const frequency = requiredFrequency(
    args.recipe.muscleVolumes[muscle].sessionsPerWeek,
    daysAvailableFor(muscle, args.split),
  )

  const dose = setsPerSession(args.targets[muscle], frequency)

  const remaining = Math.max(0, args.targets[muscle] - committed[muscle])

  /*
   * Sessions this muscle will actually get, not days that could give it
   * one.
   *
   * Those are the same number whenever the frequency matches the days
   * accountable for a muscle, which is every working week — a tier-2
   * upper muscle wants two sessions and there are two upper days. They
   * come apart on the deload, where frequency drops to one and there are
   * still two upper days, and the day count then divides the dose by a
   * session that is never going to happen.
   *
   * The visible symptom was a lopsided deload: Monday's share came out at
   * half the target, fell under the slot floor, and was skipped — so every
   * muscle waited for the second upper day and Thursday arrived carrying
   * nine exercises while Monday had none.
   */
  const sessionsPlanned = Math.max(1, frequency - args.directDays[muscle])
  const daysThatCouldTrainIt =
    1 + args.remainingDays.filter((day) => day.muscles.includes(muscle)).length
  const sessionsLeft = Math.min(daysThatCouldTrainIt, sessionsPlanned)
  const share = remaining / Math.max(1, sessionsLeft)

  /*
   * Then the day's own partial credit comes off, in full.
   *
   * A slot chosen for the lats pays the biceps on the way past, and that
   * is real volume the session delivered. Sizing the curl as though it
   * had not happened spends the same credit twice — Monday sized six
   * curl sets against an unpaid target, then placed chin-ups worth
   * another two and a half, and went out at 8.5 against a share of 5.7.
   *
   * Subtracting it here is the "adjusted for partial volume within the
   * session" half of the rule, and it is what makes the equal split
   * actually come out equal.
   */
  return Math.max(0, Math.min(share, dose, remaining) - addedToday[muscle])
}

/**
 * The easy conditioning domain, as it appears on `Slot.variant`.
 *
 * It had a second job until the session ceiling went: an `isEasyConditioning`
 * predicate kept the Zone 2 walk out of the accessory budget, because
 * charging twenty minutes of walking against a recovery allowance it does
 * not consume once halved the side delts. With no budget to be charged
 * against, the distinction has nowhere left to apply and the predicate is
 * gone — the walk is simply twenty minutes the day takes, reported by
 * `estimateDayMinutes` like everything else.
 */
const ZONE_2_VARIANT = 'Zone 2'

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
 * Rep ranges by movement, not by exercise.
 *
 * Compounds run heavy and short, isolations long and light, and there is
 * nothing in between. Every exercise used to carry its own
 * `defaultRepRange` — 8–12 here, 10–15 there, 3–6 on the overhead press —
 * fifteen or so hand-set pairs whose differences nobody could account for
 * and which drifted from each other as the catalogue grew.
 *
 * The split is the point: a compound is loaded enough that the limiting
 * factor is force, so it earns a rep range where load is the variable; an
 * isolation on a small muscle with a light implement is limited by local
 * fatigue, and 15–30 is where that muscle actually works rather than
 * where the weight runs out.
 *
 * A real consequence, since it is easy to read this as a wash: this is
 * substantially more total reps and substantially less load on every
 * isolation slot in the program. A 12–20 lateral raise becomes 15–30 with
 * the dumbbell that implies.
 */
const COMPOUND_REPS = { low: 5, high: 8 } as const
const ISOLATION_REPS = { low: 15, high: 30 } as const

/**
 * How many back-off sets a competition lift is capped at.
 *
 * Three. It was four, on the reasoning that the stopping rule usually
 * fires in three or four sets and a cap far above where the rule fires
 * only misleads the volume count. The same reasoning taken one step
 * further gives three: the cap is *materialised as slots and counted as
 * volume*, so it is the week's plan whether or not you reach it, and the
 * honest place for it is the low end of where the rule fires rather than
 * the high end.
 *
 * The screens say "1–3" now rather than "1–4", which is the same promise
 * made smaller.
 */
export const STRENGTH_BACKOFF_CAP = 3

/** Which tier a muscle sits in; the bottom tier if it is unplaced. */

/** Sessions in the whole week's split that are accountable for a muscle. */
function daysAvailableFor(muscle: MuscleGroup, split: RpSplit): number {
  return split.days.filter((day) => day.muscles.includes(muscle)).length
}

/**
 * Every work set at one rep in reserve, and the last one to failure.
 *
 * No ramp across the block. Ramping proximity to failure *and* volume at
 * the same time makes it impossible to attribute a stall to either, and
 * RIR is the variable with the least room to move: past about 2 RIR the
 * stimulus falls away, and at 0 the fatigue stops paying for itself on
 * most sets. The last set is the exception, on every exercise.
 *
 * **Every exercise, including the ones `safeToFail` used to exclude.**
 * That flag is no longer consulted here and the reasoning behind it was
 * not wrong, so it is worth stating what changed rather than what was
 * decided. It excluded two groups: isolations where failing degrades form
 * (lateral raises, shrugs, calf raises) and lifts where failing is
 * genuinely dangerous or expensive — a skullcrusher over your face, a
 * good morning under a loaded spine.
 *
 * The rep ranges above defuse the first group entirely and most of the
 * second: an isolation at 15–30 is a light implement and a long set, and
 * failing a thirty-rep French press is a different event from failing an
 * eight-rep one. What it does *not* defuse is a compound hinge at 5–8 —
 * a Romanian deadlift or a good morning taken to failure is a real risk,
 * and those are the slots to look at first if this turns out to have been
 * too broad.
 *
 * The strongest argument against it was not about safety at all, and it
 * is preserved here because it is the one that will still be true next
 * year. **Failure is not a clean event on every movement.** On a lateral
 * raise, a shrug, a calf raise or a hanging leg raise there is always
 * another rep if you cheat the form a little, so "to failure" resolves to
 * "until your technique goes" rather than to a definite point — and an
 * instruction that resolves differently every week is worse than one rep
 * in reserve every week. Dips and pull-ups are the contrast: you either
 * complete the rep or you do not, and the set ends itself.
 *
 * That was the reason most isolation work carried `safeToFail: false`,
 * and the flag is gone rather than quietly retained, because a field
 * nothing reads is a field somebody will assume still does something.
 */
function hypertrophySets(exercise: Exercise, count: number): readonly SetPrescription[] {
  const range = exercise.isCompound ? COMPOUND_REPS : ISOLATION_REPS

  return Array.from({ length: count }, (_unused, index) => {
    const isLast = index === count - 1

    return {
      load: { kind: 'rpe' as const, target: isLast ? 10 : HYPERTROPHY_RPE },
      reps: { kind: 'range' as const, low: range.low, high: range.high },
      ...(isLast ? { notes: 'Take this one to failure.' } : {}),
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
   * One exercise per muscle per session, full stop.
   *
   * This keyed on muscle *and* pattern, which stopped pull-ups being
   * followed by chin-ups and allowed a compound and an isolation for the
   * same muscle — the compound pass would place a row for the upper back
   * and the isolation pass a shrug, and the muscle's session dose arrived
   * split across two movements and two warm-ups.
   *
   * A muscle gets one movement and three to five sets of it. Splitting a
   * dose that small buys nothing: the second exercise costs its own
   * ramp-up and the sets it contributes are the ones the first was
   * already going to do. The pattern half of the key is subsumed — two
   * movements for one muscle are now barred whether they share a pattern
   * or not.
   *
   * Day-scoped, because `placed` is. The weekly repeat penalty is a
   * separate mechanism and still keys on muscle-and-pattern, which is
   * what makes the forearms get flexion one session and extension the
   * other.
   */
  const alreadyCovered = new Set(placed.map((exercise) => exercise.primaryMuscle))

  const candidates = args.deps.exercises.filter(
    (exercise) =>
      exercise.intent === 'hypertrophy' &&
      exercise.primaryMuscle === muscle &&
      !exercise.isArchived &&
      !used.has(exercise.id) &&
      !excluded.has(exercise.id) &&
      !alreadyCovered.has(exercise.primaryMuscle),
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
  /*
   * The penalty is on the *movement*, not the exact exercise.
   *
   * Two wrist curls and two reverse wrist curls are four ids and two
   * movements, so an id-level penalty happily gave the forearms a
   * barbell wrist curl on Monday and a dumbbell wrist curl on Thursday
   * and called them trained — twice in the same direction, with the
   * extensors untouched. Keying on muscle-and-pattern makes "once each
   * way" fall out of the rule that was already there.
   *
   * Same reasoning as the day-level `alreadyCovered` check above; this
   * is that idea applied across the week.
   */
  const movement = (exercise: Exercise): string => `${exercise.primaryMuscle}|${exercise.pattern}`

  const usedMovements = new Set(
    args.deps.exercises
      .filter((exercise) => args.usedThisWeek.has(exercise.id))
      .map((exercise) => movement(exercise)),
  )

  const ordered = [...candidates].sort((a, b) => {
    const aUsed = usedMovements.has(movement(a)) ? 1 : 0
    const bUsed = usedMovements.has(movement(b)) ? 1 : 0
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
  const fresh = ordered.filter((exercise) => !usedMovements.has(movement(exercise)))
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
  targets: Record<MuscleGroup, number>,
  committed: VolumeMap,
): number {
  for (let count = desired; count >= 1; count -= 1) {
    const contribution = slotVolume(
      exercise,
      Array.from({ length: count }, () => STUB),
    )

    /*
     * Bounded by the muscle's own weekly target rather than by MRV.
     *
     * MRV was a per-muscle recovery ceiling standing above the target,
     * so a slot could overshoot the ask and still be refused only at the
     * ceiling. There is no ceiling above the target any more — the target
     * is what the lifter asked for — so overshooting it is the thing to
     * refuse.
     *
     * One session's worth of slack, because a compound pays two or three
     * muscles and sizing every slot to land exactly on each of their
     * targets would refuse most useful exercises. What this stops is a
     * slot that doubles a muscle's week, not one that rounds it up.
     */
    const fits = (Object.keys(contribution) as MuscleGroup[]).every(
      (muscle) =>
        contribution[muscle] <= 0 ||
        committed[muscle] + contribution[muscle] <= targets[muscle] + MAX_DIRECT_SETS_PER_SESSION,
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
        /*
         * The routine's own note, appended rather than replacing.
         *
         * "Not counted toward volume" is the part every warm-up shares
         * and the reason the row looks different from the ones below it;
         * the per-entry note is what a rep count cannot say — which side,
         * which areas. Losing either one costs something.
         */
        notes:
          'note' in plan && typeof plan.note === 'string'
            ? `Warm-up. Not counted toward volume. ${plan.note}`
            : 'Warm-up. Not counted toward volume.',
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
      style: ZONE_2_VARIANT,
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
    style: ZONE_2_VARIANT,
    note: 'Steep incline, easy pace. You should be able to hold a conversation.',
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

  const strengthNames: string[] = []

  for (const slot of slots) {
    if (slot.exercise.kind !== 'specific') continue
    const exercise = lookup(slot.exercise.exerciseId)
    if (exercise === undefined) continue

    if (slot.role === 'strength') {
      /*
       * Every competition lift on the day, in the order it is performed.
       *
       * This kept one name and overwrote it, which was invisible while a
       * day held a single lift and wrong the moment two shared one: the
       * description named the *last* strength slot, so a session opening
       * with the squat announced itself as a deadlift day.
       *
       * Deduped because a lift is two slots — a top set and its back-offs
       * — and naming it twice reads as a stutter.
       */
      if (!strengthNames.includes(exercise.name)) strengthNames.push(exercise.name)
    }
    if (slot.role === 'warmup' || slot.role === 'conditioning') continue

    const working = slot.sets.filter(countsAsWorking).length
    if (working === 0) continue

    direct[exercise.primaryMuscle] += working

    /*
     * Counted as whole sets, and only so the day can *name* what it also
     * works. Nothing here reaches a volume target — secondary involvement
     * stopped being credited when the fractions went — but "some traps and
     * upper back" is still true and still worth saying about a rowing day.
     */
    for (const muscle of exercise.secondaryMuscles) {
      if (muscle === exercise.primaryMuscle) continue
      indirect[muscle] += working
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
  const lift =
    strengthNames.length === 0
      ? undefined
      : strengthNames.map((name) => name.replace(/\s*\([^)]*\)\s*/g, '').trim()).join(' and ')

  /*
   * The heading is which half of the body, and which time through.
   *
   * It used to name the kinds of work present — "Strength, Hypertrophy and
   * Conditioning" — which was informative while days differed and said
   * nothing once every day carried all three. A heading identical on every
   * day of the week is a heading nobody reads. "Upper 2" answers the
   * question somebody actually has on a Thursday morning.
   */

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
    label: `${splitDay.label} — ${splitDay.focusName}`,
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
 * isolation **in tier order**, then conditioning. Nothing about *what* is
 * in the session changes — only the order, which is the part the debt
 * ordering had no business deciding.
 */
function inSessionOrder(
  slots: readonly Slot[],
  library: readonly Exercise[],
  volumes: MuscleVolumes,
): readonly Slot[] {
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

  const exerciseFor = (slot: Slot): Exercise | undefined => {
    if (slot.exercise.kind !== 'specific') return undefined
    const id = slot.exercise.exerciseId
    return library.find((exercise) => exercise.id === id)
  }

  const cost = (slot: Slot): number => exerciseFor(slot)?.systemicCost ?? 0

  /**
   * The tier of the muscle an isolation slot is *for*.
   *
   * Primary only. An isolation exercise has one muscle it exists to
   * train, and ranking it by anything it merely pays on the way past
   * would put a curl ahead of a lateral raise on the strength of the
   * forearms.
   */
  /*
   * Lower sorts earlier, so this is negated: a muscle trained more often
   * is the one whose work should come while you are fresh.
   *
   * This read a tier rank directly, which sorted ascending for free.
   * Sessions a week is the nearest thing left and points the other way.
   */
  const tierOf = (slot: Slot): number => {
    const exercise = exerciseFor(slot)
    return exercise === undefined ? 0 : -volumes[exercise.primaryMuscle].sessionsPerWeek
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
      /*
       * Isolation runs in tier order, priority first.
       *
       * The fill's order is the muscle-*debt* order, which reads as
       * correct and answers a different question. A prioritised muscle
       * that is nearly paid up for the week is owed less on any given day
       * than a maintained one that has had nothing — so the biceps, at
       * tier 1 and over target, came last on a day that also trained the
       * traps at maintenance. Every isolation slot after the first is
       * performed more tired than the one before it, and spending that
       * freshness by debt rather than by priority is what a tier list is
       * supposed to decide.
       *
       * Debt still breaks ties inside a tier, via the index below. This
       * deliberately does not extend to the compounds — those are ordered
       * by systemic cost, and a heavy pull done after a curl to honour a
       * tier list would be a worse trade than the one it fixed.
       */
      if (a.slot.role === 'assistance') {
        const byTier = tierOf(a.slot) - tierOf(b.slot)
        if (byTier !== 0) return byTier
        return a.index - b.index
      }

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
