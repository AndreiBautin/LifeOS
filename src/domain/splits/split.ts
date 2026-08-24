import type { MuscleGroup } from '@/domain/exercises/taxonomy'

/**
 * A training split.
 *
 * LiftTracker had `enum TrainingSplit { PPL, UpperLower }` and then
 * branched on it twice — once to build a list of weekday sessions, once
 * inside `GenerateSessionExercisesUseCase` to decide which hardcoded
 * exercise list each weekday returned. Adding a split meant editing both
 * switch statements and writing six more literal exercise lists.
 *
 * Here a split is data: how many days, what each day is responsible for,
 * and how the framework's main lifts land on those days. Adding a split
 * is adding a value to an array.
 */

/** Which of the four 5/3/1 main lifts a day carries, if any. */
export const MAIN_LIFT_SLOTS = ['squat', 'bench', 'deadlift', 'press'] as const
export type MainLiftSlot = (typeof MAIN_LIFT_SLOTS)[number]

export const MAIN_LIFT_LABELS: Record<MainLiftSlot, string> = {
  squat: 'Squat',
  bench: 'Bench press',
  deadlift: 'Deadlift',
  press: 'Overhead press',
}

/** Lower-body lifts progress faster, so they take the larger increment. */
export const IS_LOWER_BODY: Record<MainLiftSlot, boolean> = {
  squat: true,
  deadlift: true,
  bench: false,
  press: false,
}

export interface SplitDay {
  readonly index: number
  readonly label: string
  /**
   * The main lift this day carries. Undefined is meaningful and common:
   * a six-day push/pull/legs split has six days but only four main lifts,
   * so two days are pure accessory volume. Forcing a main lift onto every
   * day is how a split ends up with six squat sessions a week.
   */
  readonly mainLift?: MainLiftSlot
  /**
   * Muscles this day is responsible for. The assistance filler distributes
   * each muscle's weekly target across the days that claim it.
   */
  readonly muscles: readonly MuscleGroup[]
}

export interface SplitDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly daysPerWeek: number
  /**
   * How many weeks the day pattern takes to repeat.
   *
   * Normally 1. Three days a week does not divide four main lifts evenly,
   * so that pattern only closes after four weeks — `days` then holds
   * twelve entries covering four weeks of three.
   */
  readonly cycleWeeks: number
  readonly days: readonly SplitDay[]
}

const upper: readonly MuscleGroup[] = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'triceps',
  'biceps',
  'lats',
  'upper-back',
]
const lower: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core']
const push: readonly MuscleGroup[] = ['chest', 'front-delts', 'side-delts', 'triceps']
const pull: readonly MuscleGroup[] = ['lats', 'upper-back', 'rear-delts', 'biceps', 'forearms']
const legs: readonly MuscleGroup[] = ['quads', 'hamstrings', 'glutes', 'calves', 'core']

/** The classic four-day layout: one main lift per day, assistance around it. */
const FOUR_DAY_MAIN: SplitDefinition = {
  id: 'four-day-main',
  name: '4-day — one main lift per day',
  description:
    'The default 5/3/1 layout. Each session opens with one of the four lifts, then supplemental and assistance work.',
  daysPerWeek: 4,
  cycleWeeks: 1,
  days: [
    { index: 0, label: 'Press', mainLift: 'press', muscles: [...upper] },
    { index: 1, label: 'Deadlift', mainLift: 'deadlift', muscles: [...lower] },
    { index: 2, label: 'Bench', mainLift: 'bench', muscles: [...upper] },
    { index: 3, label: 'Squat', mainLift: 'squat', muscles: [...lower] },
  ],
}

/**
 * Four-day upper/lower. Structurally close to the classic layout, but the
 * assistance is grouped by region rather than trailing the main lift,
 * which spreads chest and back volume more evenly across the week.
 */
const UPPER_LOWER_4: SplitDefinition = {
  id: 'upper-lower-4',
  name: '4-day upper / lower',
  description:
    'Upper A, Lower A, Upper B, Lower B. Each session carries one main lift; assistance is grouped by region.',
  daysPerWeek: 4,
  cycleWeeks: 1,
  days: [
    { index: 0, label: 'Upper A', mainLift: 'bench', muscles: [...upper] },
    { index: 1, label: 'Lower A', mainLift: 'squat', muscles: [...lower] },
    { index: 2, label: 'Upper B', mainLift: 'press', muscles: [...upper] },
    { index: 3, label: 'Lower B', mainLift: 'deadlift', muscles: [...lower] },
  ],
}

/**
 * Six-day push/pull/legs. Four main lifts across six days, so the pull
 * days carry none — the deadlift already sits on a legs day, and doubling
 * it is how backs get hurt. Those days become pure back volume, which is
 * what a pull day should be anyway.
 */
const PPL_6: SplitDefinition = {
  id: 'ppl-6',
  name: '6-day push / pull / legs',
  description:
    'Two rotations of push, pull and legs. Four of the six days open with a main lift; the other two are accessory volume.',
  daysPerWeek: 6,
  cycleWeeks: 1,
  days: [
    { index: 0, label: 'Push A', mainLift: 'bench', muscles: [...push] },
    { index: 1, label: 'Pull A', muscles: [...pull] },
    { index: 2, label: 'Legs A', mainLift: 'squat', muscles: [...legs] },
    { index: 3, label: 'Push B', mainLift: 'press', muscles: [...push] },
    { index: 4, label: 'Pull B', muscles: [...pull] },
    { index: 5, label: 'Legs B', mainLift: 'deadlift', muscles: [...legs] },
  ],
}

/** Five-day push/pull/legs/upper/lower — a common compromise. */
const PPL_UL_5: SplitDefinition = {
  id: 'ppl-ul-5',
  name: '5-day push / pull / legs / upper / lower',
  description: 'Push, pull and legs once each, then an upper and a lower day to raise frequency.',
  daysPerWeek: 5,
  cycleWeeks: 1,
  days: [
    { index: 0, label: 'Push', mainLift: 'bench', muscles: [...push] },
    { index: 1, label: 'Pull', muscles: [...pull] },
    { index: 2, label: 'Legs', mainLift: 'squat', muscles: [...legs] },
    { index: 3, label: 'Upper', mainLift: 'press', muscles: [...upper] },
    { index: 4, label: 'Lower', mainLift: 'deadlift', muscles: [...lower] },
  ],
}

/**
 * Three days a week. Four main lifts do not divide into three sessions,
 * so the pattern only closes after four weeks — twelve days covering
 * every lift three times.
 */
const THREE_DAY_ROTATING: SplitDefinition = {
  id: 'three-day-rotating',
  name: '3-day rotating full body',
  description:
    'Three sessions a week with the four main lifts rotating. The pattern repeats every four weeks rather than every one.',
  daysPerWeek: 3,
  cycleWeeks: 4,
  days: [
    { index: 0, label: 'Day 1 — Squat', mainLift: 'squat', muscles: [...lower, ...upper] },
    { index: 1, label: 'Day 2 — Bench', mainLift: 'bench', muscles: [...upper] },
    { index: 2, label: 'Day 3 — Deadlift', mainLift: 'deadlift', muscles: [...lower] },
    { index: 3, label: 'Day 4 — Press', mainLift: 'press', muscles: [...upper] },
    { index: 4, label: 'Day 5 — Squat', mainLift: 'squat', muscles: [...lower] },
    { index: 5, label: 'Day 6 — Bench', mainLift: 'bench', muscles: [...upper] },
    { index: 6, label: 'Day 7 — Deadlift', mainLift: 'deadlift', muscles: [...lower] },
    { index: 7, label: 'Day 8 — Press', mainLift: 'press', muscles: [...upper] },
    { index: 8, label: 'Day 9 — Squat', mainLift: 'squat', muscles: [...lower] },
    { index: 9, label: 'Day 10 — Bench', mainLift: 'bench', muscles: [...upper] },
    { index: 10, label: 'Day 11 — Deadlift', mainLift: 'deadlift', muscles: [...lower] },
    { index: 11, label: 'Day 12 — Press', mainLift: 'press', muscles: [...upper] },
  ],
}

/** Two main lifts a day, two days a week — the minimum viable layout. */
const TWO_DAY: SplitDefinition = {
  id: 'two-day',
  name: '2-day full body',
  description: 'Two sessions a week, two main lifts each. For a limited schedule.',
  daysPerWeek: 2,
  cycleWeeks: 2,
  days: [
    { index: 0, label: 'Day 1 — Squat', mainLift: 'squat', muscles: [...lower, ...push] },
    { index: 1, label: 'Day 2 — Bench', mainLift: 'bench', muscles: [...upper] },
    { index: 2, label: 'Day 3 — Deadlift', mainLift: 'deadlift', muscles: [...lower, ...pull] },
    { index: 3, label: 'Day 4 — Press', mainLift: 'press', muscles: [...upper] },
  ],
}

export const BUILT_IN_SPLITS: readonly SplitDefinition[] = [
  FOUR_DAY_MAIN,
  UPPER_LOWER_4,
  PPL_6,
  PPL_UL_5,
  THREE_DAY_ROTATING,
  TWO_DAY,
]

export function findSplit(id: string): SplitDefinition | undefined {
  return BUILT_IN_SPLITS.find((split) => split.id === id)
}

/** Days in one full turn of the pattern, which is not always `daysPerWeek`. */
export function daysInCycle(split: SplitDefinition): number {
  return split.days.length
}

/** How many times a muscle is trained per week under this split. */
export function weeklyFrequency(split: SplitDefinition, muscle: MuscleGroup): number {
  const hits = split.days.filter((day) => day.muscles.includes(muscle)).length
  return hits / split.cycleWeeks
}

/** The days in one week of the pattern, for a given week of the cycle. */
export function daysForWeek(split: SplitDefinition, weekIndex: number): readonly SplitDay[] {
  const offset = (weekIndex % split.cycleWeeks) * split.daysPerWeek
  return split.days.slice(offset, offset + split.daysPerWeek)
}
