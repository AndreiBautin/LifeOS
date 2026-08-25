import type { ExerciseQuery } from '@/domain/exercises/exercise'
import type { ExerciseId, ProgramId, SlotId } from '@/domain/ids/ids'
import type { WeightUnit } from '@/domain/units/weight'

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
export const SLOT_ROLES = [
  'main',
  'supplemental',
  'accessory',
  'assistance',
  'conditioning',
] as const
export type SlotRole = (typeof SLOT_ROLES)[number]

export const SLOT_ROLE_LABELS: Record<SlotRole, string> = {
  main: 'Main lift',
  supplemental: 'Supplemental',
  accessory: 'Accessory',
  assistance: 'Assistance',
  conditioning: 'Conditioning',
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
  readonly label: string
  readonly slots: readonly Slot[]
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
 * Seconds a working set takes to perform, excluding rest.
 *
 * A rough constant on purpose. Rest is the dominant term — at two minutes
 * between everything, a twenty-set session is forty minutes of standing
 * around before a single rep is counted — so the estimate is accurate
 * enough to compare two days against each other, which is all it is for.
 */
export const SECONDS_PER_SET = 30

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
      // Warm-ups are quick and rested through, so they cost the work but
      // not the full interval.
      seconds += set.isWarmup === true ? SECONDS_PER_SET : SECONDS_PER_SET + rest
    }
  }

  return Math.round(seconds / 60)
}

/** Estimated minutes for each day of a week, in order. */
export function estimateWeekMinutes(
  week: ProgramWeek,
  defaultRestSeconds = 120,
): readonly number[] {
  return week.days.map((day) => estimateDayMinutes(day, defaultRestSeconds))
}
