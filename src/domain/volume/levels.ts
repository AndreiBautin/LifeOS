import { invariant } from '@/domain/errors/domain-error'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'

/**
 * How much a muscle gets, in the only two numbers that decide it.
 *
 * A muscle carries **how often** it is trained and **how hard** each of
 * those sessions is. Weekly volume is the product, and there is nothing
 * else in the calculation:
 *
 * ```
 *   weekly sets = sessions a week × sets per session for its level
 * ```
 *
 * This replaced RP's volume landmarks — MV, MEV, MAV and MRV, four
 * numbers per muscle, fifteen muscles — and the machinery that turned a
 * priority tier into a position inside that band. All of it was
 * defensible and none of it could be checked by a person holding a
 * training log. What survives of the idea is the shape: a deload is still
 * a smaller dose, and "low" is still roughly the least that grows
 * anything.
 *
 * What is deliberately lost: a landmark is a claim about a *muscle* —
 * side delts recover faster than quads and can take more — and these
 * levels are a claim about a *session*, shared by every muscle assigned
 * to them. Per-muscle differences are now expressed by assigning
 * different levels rather than by carrying different numbers, which is
 * coarser and is a decision the lifter can see and make.
 */
export const VOLUME_LEVELS = ['low', 'medium', 'high'] as const
export type VolumeLevel = (typeof VOLUME_LEVELS)[number]

export const VOLUME_LEVEL_LABELS: Record<VolumeLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

/**
 * Sets in one session, by level, plus what a deload week uses instead.
 *
 * Editable, which is the point of naming them: a lifter who finds three
 * sets too little changes one number and every muscle on "low" moves with
 * it. Under per-muscle landmarks the same intent meant editing fifteen
 * rows and hoping they stayed consistent.
 *
 * The deload is a fourth level rather than a multiplier. A percentage of
 * a per-muscle number lands on fractions and has to be rounded somewhere,
 * and "two sets" is a thing you can plan a session around in a way that
 * "sixty per cent of your usual" is not.
 */
export interface SetsPerSession {
  readonly deload: number
  readonly low: number
  readonly medium: number
  readonly high: number
}

export const DEFAULT_SETS_PER_SESSION: SetsPerSession = {
  deload: 2,
  low: 3,
  medium: 4,
  high: 5,
}

/**
 * The most sets one exercise may hold, and therefore the most a level may
 * ask for.
 *
 * One exercise per muscle per session means a level is choosing how long
 * that single exercise runs. Five is where a straight set stops being
 * productive and starts being a test of patience, and it is the number
 * the fill was already built around.
 */
export const MAX_SETS_PER_SESSION = 5

/** The most sessions a week any one muscle or lift may be given. */
export const MAX_SESSIONS_PER_WEEK = 3

/**
 * How often a muscle is trained, and how hard.
 *
 * `sessionsPerWeek` of zero is a real and useful answer — it means the
 * muscle is maintained by whatever the competition lifts pay it and gets
 * no dedicated work. It is the setting most muscles are on.
 */
export interface MuscleVolume {
  readonly sessionsPerWeek: number
  readonly level: VolumeLevel
}

export type MuscleVolumes = Readonly<Record<MuscleGroup, MuscleVolume>>

export function setsPerSessionFor(
  level: VolumeLevel,
  sets: SetsPerSession,
  isDeload: boolean,
): number {
  return isDeload ? sets.deload : sets[level]
}

/**
 * A muscle's weekly set target. One multiplication, and that is the whole
 * model.
 *
 * A deload keeps the muscle's frequency and drops every session to the
 * deload size — so a week off is a lighter version of the same week
 * rather than a different shape. Muscles at zero sessions stay at zero:
 * a deload cannot be a reason to start training something.
 */
export function weeklySetsFor(
  volume: MuscleVolume,
  sets: SetsPerSession,
  isDeload: boolean,
): number {
  return volume.sessionsPerWeek * setsPerSessionFor(volume.level, sets, isDeload)
}

export function validateSetsPerSession(sets: SetsPerSession): void {
  for (const [name, value] of Object.entries(sets)) {
    invariant(
      Number.isInteger(value) && value >= 0 && value <= MAX_SETS_PER_SESSION,
      'SETS_PER_SESSION_OUT_OF_RANGE',
      `${name} sets per session must be a whole number from 0 to ${String(MAX_SETS_PER_SESSION)}, received ${String(value)}.`,
    )
  }
}

export function validateMuscleVolumes(volumes: MuscleVolumes): void {
  for (const muscle of MUSCLE_GROUPS) {
    const volume = volumes[muscle]
    invariant(
      Number.isInteger(volume.sessionsPerWeek) &&
        volume.sessionsPerWeek >= 0 &&
        volume.sessionsPerWeek <= MAX_SESSIONS_PER_WEEK,
      'SESSIONS_PER_WEEK_OUT_OF_RANGE',
      `${muscle} must be trained between 0 and ${String(MAX_SESSIONS_PER_WEEK)} times a week, received ${String(volume.sessionsPerWeek)}.`,
    )
  }
}

/**
 * Every muscle trained, or explicitly not, with nothing left undecided.
 *
 * Zero for the seven the shipped week does not train directly — the legs
 * and glutes because the squat and the deadlift already pay them, the
 * trunk and the grip because a four-day powerlifting week is not short of
 * either.
 *
 * The hamstrings are the one to know about: no competition lift has them
 * as its primary muscle, so at zero sessions they receive nothing at all
 * rather than a little.
 *
 * **The eight it does train split into two shapes, and the split is the
 * arithmetic behind one exercise a week.** With one exercise per muscle
 * per session, a muscle on two upper days gets two slots — and a muscle
 * whose pool holds one movement fills both with the same one. That is
 * how dips, pull-ups, rows, rear delt raises and lateral raises all came
 * to appear on both upper days, reported as `"I'm noticing redundancy in
 * the exercises"`.
 */

/**
 * One session a week, and the whole of the muscle's volume in it.
 *
 * `high` rather than `low` on purpose: a level is choosing how long that
 * single exercise runs, so halving the sessions and leaving the level
 * alone would have halved the week. Five sets in one session against six
 * across two is the trade — very nearly the same volume, in one movement
 * instead of the same movement twice.
 *
 * Which day each of these lands on is the split's business, not this
 * file's: they are paired against the competition lift that already
 * trains them. See `rp-splits.ts`.
 */
const ONCE: readonly MuscleGroup[] = ['chest', 'side-delts', 'rear-delts', 'lats', 'upper-back']

/**
 * Twice a week, because twice is not a repeat for these.
 *
 * The arms have four and two hypertrophy options respectively, so the
 * rotation gives them a different movement each session — a dumbbell curl
 * and then an EZ bar curl is two exercises, not one done twice. The
 * calves have exactly one, so `barbell-calf-raise` is the single exercise
 * in the week that genuinely repeats, and it is the one that was asked to.
 */
const TWICE: readonly MuscleGroup[] = ['biceps', 'triceps', 'calves']

export const DEFAULT_MUSCLE_VOLUMES: MuscleVolumes = Object.fromEntries(
  MUSCLE_GROUPS.map((muscle) => [
    muscle,
    ONCE.includes(muscle)
      ? { sessionsPerWeek: 1, level: 'high' }
      : TWICE.includes(muscle)
        ? { sessionsPerWeek: 2, level: 'low' }
        : { sessionsPerWeek: 0, level: 'low' },
  ]),
) as MuscleVolumes

/**
 * Fills in any muscle a saved setting does not mention.
 *
 * The same trap `completeTiers` existed for: `MUSCLE_GROUP_LABELS` is a
 * `Record<MuscleGroup, …>` so a new muscle group fails the build, but a
 * *stored* volume map is just data and a new group silently arrives
 * missing. Typecheck passed with traps untiered once already.
 */
export function completeMuscleVolumes(saved: Partial<MuscleVolumes>): MuscleVolumes {
  return Object.fromEntries(
    MUSCLE_GROUPS.map((muscle) => [muscle, saved[muscle] ?? DEFAULT_MUSCLE_VOLUMES[muscle]]),
  ) as MuscleVolumes
}
