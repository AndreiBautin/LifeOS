import type { ExerciseId } from '@/domain/ids/ids'
import { asExerciseId } from '@/domain/ids/ids'
import { STRENGTH_LIFT_SLUGS } from '@/domain/exercises/catalogue'

/**
 * The lifter as a character sheet.
 *
 * The point of gamifying training is to make a number that is otherwise
 * abstract — "303 lb squat" — legible as progress along a scale with a
 * top. That only works if the scale is real. Levels here are anchored to
 * published strength standards as multiples of bodyweight, so "Advanced"
 * means what it means to a coach rather than what an XP curve decided.
 *
 * XP is the other half and does a different job: it rewards *showing up*,
 * which the strength attributes cannot, because strength moves on a scale
 * of months and a training app has to say something useful on a Tuesday.
 * The two are deliberately not mixed — no amount of XP raises a strength
 * level, because that would be the app lying about how strong somebody is.
 */

export const LEVELS = ['Untrained', 'Novice', 'Intermediate', 'Advanced', 'Elite'] as const
export type Level = (typeof LEVELS)[number]

/**
 * Bodyweight multiples for a one-rep max at each level.
 *
 * Male standards in the region of ExRx and Symmetric Strength; they
 * differ in the decimals but agree on the shape. The values matter less
 * than that they are fixed and external: a scale the app can move is a
 * scale that means nothing.
 */
export const STRENGTH_STANDARDS: Readonly<Record<string, readonly number[]>> = {
  [STRENGTH_LIFT_SLUGS.squat]: [0.75, 1.25, 1.5, 2.25, 2.75],
  [STRENGTH_LIFT_SLUGS.bench]: [0.5, 0.75, 1.25, 1.75, 2.0],
  [STRENGTH_LIFT_SLUGS.deadlift]: [1.0, 1.5, 2.0, 2.5, 3.0],
  'overhead-press': [0.35, 0.55, 0.8, 1.0, 1.2],
}

/**
 * The total, per level — summed from the three lifts rather than listed.
 *
 * Written separately they drifted: the hand-typed total said a lifter was
 * a Novice while all three of his individual lifts said Intermediate,
 * which is not a judgement call, it is an arithmetic error the reader has
 * no way to spot.
 */
export const TOTAL_STANDARDS: readonly number[] = LEVELS.map((_unused, index) =>
  Number(
    (
      (STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.squat]?.[index] ?? 0) +
      (STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.bench]?.[index] ?? 0) +
      (STRENGTH_STANDARDS[STRENGTH_LIFT_SLUGS.deadlift]?.[index] ?? 0)
    ).toFixed(2),
  ),
)

export interface Attribute {
  readonly name: string
  /** The measured quantity, or undefined when nothing has been recorded. */
  readonly value?: number
  readonly unit: string
  readonly level: Level
  /** 0–1 toward the next level. 1 when already at the top. */
  readonly progress: number
  readonly next?: { readonly level: Level; readonly needed: number }
  readonly detail: string
}

/**
 * Where a value sits on a ladder of thresholds.
 *
 * Interpolates between rungs rather than snapping, because the gap
 * between Novice and Intermediate is months of work and a bar that does
 * not move for months is not motivating — the whole reason to show a
 * scale is that progress within a level is visible.
 */
export function placeOnLadder(
  value: number,
  thresholds: readonly number[],
): { level: Level; progress: number; nextThreshold?: number } {
  const top = thresholds.length - 1

  if (value < (thresholds[0] ?? 0)) {
    return {
      level: 'Untrained',
      progress: Math.max(0, value / (thresholds[0] ?? 1)),
      ...(thresholds[0] !== undefined ? { nextThreshold: thresholds[0] } : {}),
    }
  }

  for (let index = top; index >= 0; index -= 1) {
    const floor = thresholds[index]
    if (floor === undefined || value < floor) continue

    if (index === top) return { level: LEVELS[top] ?? 'Elite', progress: 1 }

    const ceiling = thresholds[index + 1] ?? floor
    const span = ceiling - floor

    return {
      level: LEVELS[index] ?? 'Untrained',
      progress: span > 0 ? Math.min(1, (value - floor) / span) : 1,
      nextThreshold: ceiling,
    }
  }

  return { level: 'Untrained', progress: 0 }
}

/**
 * The same ladder for a quantity where lower is better — a mile time.
 *
 * Written as its own function rather than by negating the input into
 * {@link placeOnLadder}. The arithmetic that inverts a descending scale
 * is short, unreadable, and wrong in a way no test would obviously catch:
 * it produces plausible levels for every input while silently reversing
 * the progress bar.
 */
export function placeDescending(
  value: number,
  thresholds: readonly number[],
): { level: Level; progress: number } {
  const top = thresholds.length - 1
  const slowest = thresholds[0] ?? 0

  if (value > slowest) {
    return { level: 'Untrained', progress: 0 }
  }

  for (let index = top; index >= 0; index -= 1) {
    const ceiling = thresholds[index]
    if (ceiling === undefined || value > ceiling) continue

    if (index === top) return { level: LEVELS[top] ?? 'Elite', progress: 1 }

    const floor = thresholds[index + 1] ?? ceiling
    const span = ceiling - floor

    return {
      level: LEVELS[index] ?? 'Untrained',
      progress: span > 0 ? Math.min(1, (ceiling - value) / span) : 1,
    }
  }

  return { level: 'Untrained', progress: 0 }
}

export interface CharacterInputs {
  readonly estimatedMaxes: Readonly<Partial<Record<ExerciseId, number>>>
  readonly bodyweight?: number
  /** Completed sessions, ever. */
  readonly sessions: number
  /** Completed working sets, ever. */
  readonly workingSets: number
  /** Sessions completed in the last seven days. */
  readonly sessionsThisWeek: number
  /** Best recorded mile time in seconds, if any. */
  readonly mileSeconds?: number
}

export interface Character {
  readonly total?: number
  readonly totalAttribute: Attribute
  readonly lifts: readonly Attribute[]
  readonly conditioning: Attribute
  readonly consistency: Attribute
  readonly xp: number
  readonly xpLevel: number
  readonly xpIntoLevel: number
  readonly xpForNextLevel: number
}

/** XP for one completed session, plus one per working set. */
const XP_PER_SESSION = 50
const XP_PER_SET = 5

/**
 * XP needed to reach a given level, growing quadratically.
 *
 * A flat curve makes level 40 arrive as fast as level 4 and the number
 * stops meaning anything; an exponential one stalls within a month. This
 * is the middle: early levels come quickly enough to notice, and later
 * ones take a block of training each.
 */
export function xpForLevel(level: number): number {
  // Level 1 starts at zero, not at 100. Squaring the level itself put the
  // floor of the first level above the XP a new lifter has, and the
  // progress bar opened at "-100 / 300".
  const steps = Math.max(0, level - 1)
  return 100 * steps * steps
}

export function levelFromXp(xp: number): { level: number; into: number; needed: number } {
  let level = 1
  while (xp >= xpForLevel(level + 1)) level += 1

  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)

  return { level, into: xp - floor, needed: ceiling - floor }
}

/** Mile times in seconds, fastest-last, matching the level ladder. */
const MILE_STANDARDS: readonly number[] = [12 * 60, 10 * 60, 8 * 60, 6.5 * 60, 5.5 * 60]

export function buildCharacter(inputs: CharacterInputs): Character {
  const { estimatedMaxes, bodyweight } = inputs

  const liftIds: readonly [ExerciseId, string][] = [
    [asExerciseId(STRENGTH_LIFT_SLUGS.squat), 'Squat'],
    [asExerciseId(STRENGTH_LIFT_SLUGS.bench), 'Bench press'],
    [asExerciseId(STRENGTH_LIFT_SLUGS.deadlift), 'Deadlift'],
  ]

  const lifts = liftIds.map(([id, name]): Attribute => {
    const max = estimatedMaxes[id]
    const standards = STRENGTH_STANDARDS[id as string] ?? []

    if (max === undefined || bodyweight === undefined || bodyweight <= 0) {
      return {
        name,
        unit: 'lb',
        level: 'Untrained',
        progress: 0,
        detail:
          max === undefined
            ? 'No max recorded yet.'
            : 'Set your bodyweight — these standards are multiples of it.',
      }
    }

    const ratio = max / bodyweight
    const placed = placeOnLadder(ratio, standards)

    return {
      name,
      value: max,
      unit: 'lb',
      level: placed.level,
      progress: placed.progress,
      ...(placed.nextThreshold !== undefined
        ? {
            next: {
              level: nextLevelAfter(placed.level),
              needed: Math.round(placed.nextThreshold * bodyweight),
            },
          }
        : {}),
      detail: `${ratio.toFixed(2)}× bodyweight`,
    }
  })

  const total =
    bodyweight !== undefined && bodyweight > 0
      ? liftIds.slice(0, 3).reduce((sum, [id]) => sum + (estimatedMaxes[id] ?? 0), 0)
      : undefined

  const totalPlaced =
    total !== undefined && bodyweight !== undefined && bodyweight > 0 && total > 0
      ? placeOnLadder(total / bodyweight, TOTAL_STANDARDS)
      : undefined

  const totalAttribute: Attribute = {
    name: 'Powerlifting total',
    ...(total !== undefined && total > 0 ? { value: total } : {}),
    unit: 'lb',
    level: totalPlaced?.level ?? 'Untrained',
    progress: totalPlaced?.progress ?? 0,
    ...(totalPlaced?.nextThreshold !== undefined && bodyweight !== undefined
      ? {
          next: {
            level: nextLevelAfter(totalPlaced.level),
            needed: Math.round(totalPlaced.nextThreshold * bodyweight),
          },
        }
      : {}),
    detail:
      total !== undefined && total > 0 && bodyweight !== undefined
        ? `${(total / bodyweight).toFixed(2)}× bodyweight — squat, bench and deadlift`
        : 'Needs all three maxes and your bodyweight.',
  }

  const milePlaced =
    inputs.mileSeconds !== undefined
      ? placeDescending(inputs.mileSeconds, MILE_STANDARDS)
      : undefined

  const conditioning: Attribute = {
    name: 'Conditioning',
    ...(inputs.mileSeconds !== undefined ? { value: inputs.mileSeconds } : {}),
    unit: 'mile',
    level: milePlaced?.level ?? 'Untrained',
    progress: milePlaced?.progress ?? 0,
    detail:
      inputs.mileSeconds === undefined
        ? 'Log a timed mile to place this.'
        : `${String(Math.floor(inputs.mileSeconds / 60))}:${String(inputs.mileSeconds % 60).padStart(2, '0')} mile`,
  }

  const consistency: Attribute = {
    name: 'Consistency',
    value: inputs.sessionsThisWeek,
    unit: 'sessions this week',
    level: placeOnLadder(inputs.sessions, [5, 25, 75, 200, 500]).level,
    progress: placeOnLadder(inputs.sessions, [5, 25, 75, 200, 500]).progress,
    detail: `${String(inputs.sessions)} sessions logged, all time`,
  }

  const xp = inputs.sessions * XP_PER_SESSION + inputs.workingSets * XP_PER_SET
  const { level, into, needed } = levelFromXp(xp)

  return {
    ...(total !== undefined ? { total } : {}),
    totalAttribute,
    lifts,
    conditioning,
    consistency,
    xp,
    xpLevel: level,
    xpIntoLevel: into,
    xpForNextLevel: needed,
  }
}

function nextLevelAfter(level: Level): Level {
  const index = LEVELS.indexOf(level)
  return LEVELS[Math.min(LEVELS.length - 1, index + 1)] ?? 'Elite'
}
