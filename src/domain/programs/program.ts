import type { ExerciseQuery } from '@/domain/exercises/exercise'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import type { ExerciseId, ProgramId, SlotId } from '@/domain/ids/ids'
import type { WeightUnit } from '@/domain/units/weight'

import { nominalReps } from './prescription'
import type { ProgressionRule } from './progression-rule'
import type { SetPrescription } from './prescription'

/**
 * The role a slot plays in its session.
 *
 * Carried from LiftTracker's `RepRangeType`, which tied a rep range to
 * what the exercise was *for* rather than to the exercise itself — a good
 * instinct that survives here. Split out from the rep range so the two
 * can vary independently: a main lift is a main lift whether it is
 * prescribed at 5 reps or at 3.
 */
/**
 * What a slot is doing in the session.
 *
 * The distinctions that matter are the ones a lifter reads differently.
 * `main` is the competition lift itself — the RTS top set the session is
 * built around; `strength` is the back-off work that follows it on the
 * same lift, which is heavy but is not the thing being tested. Grouping
 * both under one label made a five-set back-off look like five attempts
 * at a max.
 *
 * `hypertrophy` and `assistance` are both growth work, split by whether
 * the movement is compound: a chest-supported row and a rear-delt raise
 * belong to the same goal and cost very different amounts. Both therefore
 * *label* as "Hypertrophy", with the compound/isolation split shown as a
 * sub-category beside it — the same relationship the competition lifts
 * have to strength. The role names are kept as they are because they are
 * written into every stored log.
 *
 * `warmup` is its own role rather than borrowed from `conditioning`.
 * Shoulder dislocations are not conditioning, and labelling them as such
 * made a mobility drill and a twenty-minute run read as the same kind of
 * thing.
 */
export const SLOT_ROLES = [
  'warmup',
  'main',
  'strength',
  'hypertrophy',
  'assistance',
  'conditioning',
] as const
export type SlotRole = (typeof SLOT_ROLES)[number]

/**
 * A label for a role, tolerating one this build does not know.
 *
 * A stored program can carry a role from an older version — the badge
 * rendered as a bare dash when it did, which reads as a bug rather than
 * as "unlabelled".
 */
export function slotRoleLabel(role: string): string {
  return (SLOT_ROLE_LABELS as Partial<Record<string, string>>)[role] ?? 'Work'
}

export const SLOT_ROLE_LABELS: Record<SlotRole, string> = {
  warmup: 'Warm-up',
  main: 'Main lift',
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  assistance: 'Hypertrophy',
  conditioning: 'Conditioning',
}

/**
 * The sub-category a slot reads under its role.
 *
 * Every category has one, so the badge pair is a consistent shape rather
 * than something that appears on some rows and not others: strength
 * splits into the top set and the back-offs, hypertrophy into compound
 * and isolation, warm-ups into upper and lower. In each case the two are
 * the same kind of work done differently, not different kinds of work.
 *
 * Carried on the slot rather than derived from the role, because two of
 * the three cannot be read off the role at all — a warm-up is upper or
 * lower according to the day it opens, and a strength slot is a top set
 * or a back-off according to which of the pair it is.
 */
export function slotVariant(slot: { readonly role: string; readonly variant?: string }): string {
  return slot.variant ?? (SLOT_ROLE_VARIANTS as Partial<Record<string, string>>)[slot.role] ?? ''
}

/**
 * The fallback for a slot with no variant of its own.
 *
 * Only reached by a workout logged before slots carried one. Compound and
 * isolation are recoverable from the role; a warm-up's body half and a
 * strength slot's position in the pair are not, and those simply show no
 * sub-badge rather than a guessed one.
 */
export const SLOT_ROLE_VARIANTS: Partial<Record<SlotRole, string>> = {
  hypertrophy: 'Compound',
  assistance: 'Isolation',
}

/**
 * The badge tone each role reads in.
 *
 * Colour-coded because the role is the fastest way to tell, mid-session,
 * whether the thing on screen is the lift the day is about or something
 * to get through. Every role having the same grey badge meant reading the
 * word every time.
 */
export type BadgeTone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'cool'

export function slotRoleTone(role: string): BadgeTone {
  return (SLOT_ROLE_TONES as Partial<Record<string, BadgeTone>>)[role] ?? 'neutral'
}

/**
 * The heading a slot reads under when a session is shown as sections.
 *
 * Deliberately *not* `SLOT_ROLE_LABELS`. That map answers "what kind of
 * work is this row" for a badge sitting beside one exercise, and it
 * collapses `hypertrophy` and `assistance` into one word because from a
 * single row's point of view they are the same kind of work. A heading
 * answers a different question — "what is this part of the session" —
 * and there the split is the whole point: the compounds are the part
 * done fresh and the isolation is the part done after them.
 *
 * The strength pair goes the other way for the same reason. A top set
 * and its back-offs are two badges on two rows and one trip to the rack,
 * so they read as one heading.
 */
const SECTION_TITLES: Record<SlotRole, string> = {
  warmup: 'Warm-up',
  main: 'Strength',
  strength: 'Strength',
  hypertrophy: 'Compounds',
  assistance: 'Isolation',
  conditioning: 'Conditioning',
}

export function sectionTitle(role: string): string {
  return (SECTION_TITLES as Partial<Record<string, string>>)[role] ?? 'Work'
}

export interface SlotSection<T> {
  readonly title: string
  readonly slots: readonly T[]
}

/**
 * A session cut into the parts a person performs it in.
 *
 * Presentation only, and it must stay that way: **the runs are
 * consecutive, so this cannot reorder anything.** Grouping by role
 * instead — collecting every warm-up, then every compound — would look
 * identical almost always and would silently be a second opinion about
 * session order, competing with `inSessionOrder` and with
 * `trailingLast`. The latter is the case that would break: it moves the
 * grip and trunk work to the end of the accessory block *past* slots of
 * another role, and a by-role grouping would quietly pull a wrist curl
 * back up above the isolation it was deliberately placed after.
 *
 * The visible consequence of consecutive runs is that a heading can
 * repeat if a session interleaves roles. That is honest: two blocks of
 * compound work with isolation between them is something a reader should
 * see, not something a tidy heading should hide.
 */
export function inSections<T extends { readonly role: string }>(
  slots: readonly T[],
): readonly SlotSection<T>[] {
  const sections: SlotSection<T>[] = []

  for (const slot of slots) {
    const title = sectionTitle(slot.role)
    const last = sections[sections.length - 1]

    if (last?.title === title) {
      sections[sections.length - 1] = { title, slots: [...last.slots, slot] }
      continue
    }

    sections.push({ title, slots: [slot] })
  }

  return sections
}

export const SLOT_ROLE_TONES: Record<SlotRole, BadgeTone> = {
  // Its own hue, on the same level as strength and conditioning. Grey now
  // belongs to the sub-category badges, and a grey warm-up read as one.
  warmup: 'cool',
  main: 'accent',
  strength: 'accent',
  hypertrophy: 'good',
  assistance: 'good',
  conditioning: 'warn',
}

/**
 * Which exercise a slot is for.
 *
 * A slot may name one exercise, or describe the shape of an acceptable
 * exercise and let the app pick. The second form is what makes a template
 * portable between gyms and is LiftTracker's selection query promoted
 * from generator internals to editable program data.
 */
export type ExerciseRef =
  | { readonly kind: 'specific'; readonly exerciseId: ExerciseId }
  | { readonly kind: 'query'; readonly query: ExerciseQuery; readonly label: string }

/** One exercise on one day. */
export interface Slot {
  readonly id: SlotId
  readonly role: SlotRole
  /** The sub-category shown beside the role — see {@link slotVariant}. */
  readonly variant?: string
  readonly exercise: ExerciseRef
  readonly sets: readonly SetPrescription[]
  readonly restSeconds?: number
  /**
   * Slots sharing a group id alternate set for set. Absent means the slot
   * is performed straight through.
   */
  readonly supersetGroup?: string
  readonly notes?: string
}

/**
 * One training day.
 *
 * Deliberately identified by index, not by weekday. LiftTracker keyed
 * sessions to `DayOfTheWeek` and then dispatched on it
 * (`case Monday: return GeneratePush(1, ...)`), which makes a rotating
 * four-day cycle — exactly what 5/3/1 runs — inexpressible, and forces a
 * missed Tuesday to be either skipped or to corrupt the schedule. A day
 * here is the Nth training day of its week; it acquires a calendar date
 * only when a lifter starts it.
 */
export interface ProgramDay {
  readonly index: number
  /** The day's name: the weekday and what it is built around. */
  readonly label: string
  /**
   * The second line: what kind of work it is, and what it trains.
   *
   * Separate from the label because they answer different questions and
   * are read at different moments. "Tuesday — Strength and Hypertrophy"
   * is what you check on the way to the gym; "Low Bar Squat, then quads,
   * core, calves and hamstrings. Some glutes, forearms and upper back."
   * is what you check when deciding whether the week is balanced. Run
   * together they make one unreadable heading, which is what they were.
   */
  readonly focus?: string
  readonly slots: readonly Slot[]
  /**
   * What this day set out to deliver, per muscle, in credited sets.
   *
   * Carried on the day rather than recomputed, because the session needs
   * to compare against the number the *assembler* used and no other. The
   * fill's share of a weekly target depends on how many days remain and
   * what earlier days already committed — reproducing that in the player
   * would be a second implementation of the thing most likely to drift.
   *
   * It exists because RTS back-off volume is discovered rather than
   * planned. The plan materialises the cap and counts all of it, so a
   * lifter who stops at two back-offs instead of four is several sets
   * short in a week that reports itself complete. Knowing the target
   * turns that into a number they can act on before leaving the gym.
   *
   * Only the muscles the day is *for*. A session pays a dozen more
   * incidentally, and listing those turns a glanceable answer into a
   * table nobody reads between sets.
   */
  readonly volumeTargets?: Readonly<Partial<Record<MuscleGroup, number>>>
  readonly notes?: string
}

export interface ProgramWeek {
  readonly index: number
  readonly label: string
  /**
   * Marks the week as a planned reduction. Both old apps had deloads
   * hardcoded as "week 4" inside the generator; here it is a property of
   * the week, so a three-week or six-week block works without changing
   * any code.
   */
  readonly isDeload: boolean
  readonly days: readonly ProgramDay[]
  readonly notes?: string
}

/**
 * A phase of training with a coherent goal — LiftTracker's `TrainingBlock`
 * plus `TrainingPhase`, merged, since one never appeared without the other.
 */
export const TRAINING_PHASES = ['hypertrophy', 'strength', 'peaking', 'general'] as const
export type TrainingPhase = (typeof TRAINING_PHASES)[number]

export const TRAINING_PHASE_LABELS: Record<TrainingPhase, string> = {
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
  peaking: 'Peaking',
  general: 'General',
}

export interface ProgramBlock {
  readonly index: number
  readonly label: string
  readonly phase: TrainingPhase
  readonly weeks: readonly ProgramWeek[]
  /**
   * Applied when the block's last week completes and the block repeats —
   * this is where 5/3/1's "+5 lb upper, +10 lb lower after every cycle"
   * lives.
   */
  readonly progression: readonly ProgressionRule[]
  /**
   * How many times this block repeats before the program moves on. 5/3/1
   * is one block repeated indefinitely; an RP macrocycle is three
   * hypertrophy blocks, then strength, then peaking.
   */
  readonly repeat: number | 'indefinite'
  readonly notes?: string
}

export interface ProgramSettings {
  readonly units: WeightUnit
  /** Bar/plate granularity. See domain/units/weight.ts for why this is programmable. */
  readonly roundingIncrement: number
  readonly defaultRestSeconds: number
}

export const DEFAULT_PROGRAM_SETTINGS: ProgramSettings = {
  units: 'lb',
  roundingIncrement: 5,
  defaultRestSeconds: 120,
}

export type ProgramOrigin = 'built-in' | 'fork' | 'custom'

export interface ProgramTemplate {
  readonly id: ProgramId
  readonly name: string
  readonly description: string
  readonly origin: ProgramOrigin
  /** Set when this template was forked from another, for provenance. */
  readonly forkedFrom?: ProgramId
  readonly author?: string
  readonly blocks: readonly ProgramBlock[]
  readonly settings: ProgramSettings
  readonly tags: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/* -------------------------------------------------------------------- */
/* Derived shape                                                         */
/* -------------------------------------------------------------------- */

export function totalWeeks(program: ProgramTemplate): number {
  return program.blocks.reduce((sum, block) => {
    const repeats = block.repeat === 'indefinite' ? 1 : block.repeat
    return sum + block.weeks.length * repeats
  }, 0)
}

export function totalSlots(program: ProgramTemplate): number {
  return program.blocks.reduce(
    (blockSum, block) =>
      blockSum +
      block.weeks.reduce(
        (weekSum, week) =>
          weekSum + week.days.reduce((daySum, day) => daySum + day.slots.length, 0),
        0,
      ),
    0,
  )
}

/** Distinct training days per week, taken from the first week of the first block. */
export function daysPerWeek(program: ProgramTemplate): number {
  return program.blocks[0]?.weeks[0]?.days.length ?? 0
}

export function findDay(
  program: ProgramTemplate,
  blockIndex: number,
  weekIndex: number,
  dayIndex: number,
): ProgramDay | undefined {
  return program.blocks[blockIndex]?.weeks[weekIndex]?.days[dayIndex]
}

export function isIndefinite(program: ProgramTemplate): boolean {
  return program.blocks.some((block) => block.repeat === 'indefinite')
}

/* -------------------------------------------------------------------- */
/* Session length                                                        */
/* -------------------------------------------------------------------- */

/**
 * Seconds one rep takes, under load.
 *
 * This was `SECONDS_PER_SET = 30`, a flat cost per set, defended on the
 * grounds that rest dominates — at two minutes between everything, a
 * twenty-set session is forty minutes of standing around before a rep is
 * counted. That held while every set was eight to twelve reps.
 *
 * It stopped holding when isolations went to 15–30 and the competition
 * lifts to triples. A flat thirty seconds costs a thirty-rep lateral
 * raise the same as a three-rep squat, and those differ by more than a
 * minute — so an upper day full of long isolation sets was being reported
 * at the same length as before while genuinely running a quarter longer.
 *
 * Three seconds a rep is the compromise: about two under load plus the
 * turnaround, honest for a straight set and too slow for a fast triple,
 * which is the direction to err in for an estimate a person plans an
 * evening around.
 */
export const SECONDS_PER_REP = 3

/** The floor for a set, so a short set still costs its setup. */
export const MINIMUM_SET_SECONDS = 15

/**
 * Estimated minutes for a day, from set count and prescribed rest.
 *
 * Exists so "balanced" is something the build can check rather than
 * something a person eyeballs. The frequency autoregulator reasons about
 * *measured* session length; this is the planning-side counterpart, and
 * the two should roughly agree or the plan is lying about what it costs.
 */
export function estimateDayMinutes(day: ProgramDay, defaultRestSeconds = 120): number {
  let seconds = 0

  for (const slot of day.slots) {
    const rest = slot.restSeconds ?? defaultRestSeconds
    for (const set of slot.sets) {
      seconds += setSeconds(set, rest)
    }
  }

  return Math.round(seconds / 60)
}

/**
 * What one prescribed set costs in wall-clock seconds.
 *
 * A timed set is costed by its actual duration. Counting a twenty-minute
 * incline walk as one thirty-second set made conditioning free to the
 * planner: it could stack a run onto the longest day of the week and
 * still believe the day fit inside the target.
 *
 * Everything else is costed by its reps, which a flat per-set constant
 * could not do. A range is costed at its midpoint — the number the lifter
 * is most likely to hit — rather than at its ceiling, which would inflate
 * every isolation slot by a third.
 */
export function setSeconds(set: SetPrescription, restSeconds: number): number {
  const work =
    set.reps.kind === 'time'
      ? set.reps.seconds
      : Math.max(MINIMUM_SET_SECONDS, nominalReps(set.reps) * SECONDS_PER_REP)

  // Warm-ups are quick and rested through, so they cost the work but not
  // the full interval.
  return set.isWarmup === true ? work : work + restSeconds
}

/** Estimated minutes for each day of a week, in order. */
export function estimateWeekMinutes(
  week: ProgramWeek,
  defaultRestSeconds = 120,
): readonly number[] {
  return week.days.map((day) => estimateDayMinutes(day, defaultRestSeconds))
}
