import type { Exercise } from '@/domain/exercises/exercise'
import type { TrainingIntent } from '@/domain/exercises/loading'
import { SYSTEMIC_COST_BY_EQUIPMENT } from '@/domain/exercises/loading'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'
import { SECONDARY_SET_FRACTION } from '@/domain/volume/landmarks'

/**
 * Two kinds of tired, tracked separately because they behave differently.
 *
 * **Local fatigue** is per-muscle and is what volume landmarks measure. It
 * is why a chest that has had eighteen sets this week will not grow from a
 * nineteenth.
 *
 * **Systemic fatigue** is whole-body and landmarks cannot see it at all.
 * It is why a week of squats, deadlifts and heavy pressing wrecks you even
 * when no individual muscle has exceeded its target — and why the same
 * total set count spent on cable work would not.
 *
 * Keeping them apart is what lets the app say something more useful than
 * a set count. Strength and hypertrophy volume are *reported* separately,
 * because a lifter wants to know which is which, but they are **combined
 * for local fatigue**: a muscle does not care whether a hard set was
 * labelled strength work.
 */

/** Sets attributed to a muscle, split by why they were done. */
export interface VolumeSplit {
  readonly strength: number
  readonly hypertrophy: number
}

export type VolumeSplitMap = Record<MuscleGroup, VolumeSplit>

export function emptySplitMap(): VolumeSplitMap {
  return Object.fromEntries(
    MUSCLE_GROUPS.map((muscle) => [muscle, { strength: 0, hypertrophy: 0 }]),
  ) as VolumeSplitMap
}

/**
 * Total sets against a muscle's landmarks.
 *
 * The sum, deliberately. Reporting the split is useful; budgeting against
 * only one half of it is how a lifter ends up doing eight hard sets of
 * squats and then "only" twelve quad sets of hypertrophy work and
 * wondering why nothing recovers.
 */
export function combinedVolume(split: VolumeSplit): number {
  return split.strength + split.hypertrophy
}

export function addSplit(a: VolumeSplit, b: VolumeSplit): VolumeSplit {
  return { strength: a.strength + b.strength, hypertrophy: a.hypertrophy + b.hypertrophy }
}

export function mergeSplitMaps(maps: readonly VolumeSplitMap[]): VolumeSplitMap {
  const total = emptySplitMap()
  for (const map of maps) {
    for (const muscle of MUSCLE_GROUPS) {
      total[muscle] = addSplit(total[muscle], map[muscle])
    }
  }
  return total
}

/**
 * What a slot's working sets contribute, per muscle, tagged by intent.
 *
 * Secondary muscles are credited at a fraction, as elsewhere — counting a
 * close-grip bench as a full triceps set inflates every total, and
 * counting it as zero tells a lifter benching four times a week that their
 * triceps need more direct work.
 */
export function slotSplit(
  exercise: Exercise,
  workingSets: number,
  intent: TrainingIntent,
): VolumeSplitMap {
  const map = emptySplitMap()
  if (workingSets <= 0 || intent === 'conditioning') return map

  const key = intent === 'strength' ? 'strength' : 'hypertrophy'

  map[exercise.primaryMuscle] = { ...map[exercise.primaryMuscle], [key]: workingSets }

  for (const secondary of exercise.secondaryMuscles) {
    if (secondary === exercise.primaryMuscle) continue
    map[secondary] = {
      ...map[secondary],
      [key]: map[secondary][key] + workingSets * SECONDARY_SET_FRACTION,
    }
  }

  return map
}

/* -------------------------------------------------------------------- */
/* Systemic fatigue                                                      */
/* -------------------------------------------------------------------- */

/**
 * Whole-body cost of one working set.
 *
 * Two multipliers on top of the exercise's base cost:
 *
 *   - **Proximity to failure.** A set at RPE 9 costs far more than the
 *     same set at RPE 6. The curve is deliberately steep at the top,
 *     because the last rep before failure is where the cost lives.
 *   - **Compound status.** A movement loading the whole system taxes it
 *     even at moderate effort.
 */
export function setSystemicCost(exercise: Exercise, rpe: number): number {
  const base = exercise.systemicCost ?? SYSTEMIC_COST_BY_EQUIPMENT[exercise.equipment]
  const compound = exercise.isCompound ? 1.35 : 1

  // RPE 6 → 0.6, RPE 8 → 0.84, RPE 9 → 1.0, RPE 10 → 1.24. Superlinear
  // past 9 because that is where recovery cost stops tracking effort.
  const effort = rpe >= 9 ? 1 + (rpe - 9) * 0.24 : 0.6 + (rpe - 6) * 0.133

  return Number((base * compound * Math.max(0.3, effort)).toFixed(4))
}

/**
 * How long systemic fatigue takes to halve, in days.
 *
 * Roughly matches how long a hard lower-body session keeps costing you:
 * most of it is gone inside a week, but not inside two days.
 */
export const SYSTEMIC_HALF_LIFE_DAYS = 2.5

export interface DatedLoad {
  readonly date: string
  readonly systemicLoad: number
}

/**
 * Accumulated systemic fatigue as of a given day, with older sessions
 * decayed exponentially.
 *
 * A running total would keep climbing forever; a seven-day window would
 * treat a session from six days ago as costing exactly as much as
 * yesterday's. Neither is true, and the difference matters when deciding
 * whether today should be trimmed.
 */
export function systemicFatigueOn(sessions: readonly DatedLoad[], asOf: Date): number {
  const asOfMs = startOfDay(asOf).getTime()
  let total = 0

  for (const session of sessions) {
    const days = (asOfMs - startOfDay(new Date(`${session.date}T00:00:00`)).getTime()) / 86_400_000
    if (days < 0) continue
    total += session.systemicLoad * Math.pow(0.5, days / SYSTEMIC_HALF_LIFE_DAYS)
  }

  return Number(total.toFixed(3))
}

/**
 * A lifter's rough tolerance for accumulated systemic load.
 *
 * Not a hard limit and not a measurement — a reference line, so the
 * accumulated number has something to be read against. Derived from
 * training frequency because someone training six days a week has, by
 * revealed preference, a higher tolerance than someone training twice.
 */
export function systemicTolerance(daysPerWeek: number): number {
  return Number((3.2 + daysPerWeek * 0.9).toFixed(2))
}

export type SystemicStatus = 'fresh' | 'working' | 'high' | 'excessive'

export function systemicStatus(accumulated: number, tolerance: number): SystemicStatus {
  const ratio = tolerance <= 0 ? 0 : accumulated / tolerance
  if (ratio < 0.45) return 'fresh'
  if (ratio < 0.85) return 'working'
  if (ratio < 1.1) return 'high'
  return 'excessive'
}

export const SYSTEMIC_STATUS_LABELS: Record<SystemicStatus, string> = {
  fresh: 'Fresh',
  working: 'Working',
  high: 'High',
  excessive: 'Beyond tolerance',
}

export function describeSystemicStatus(status: SystemicStatus): string {
  switch (status) {
    case 'fresh':
      return 'Systemic fatigue is low. There is room to add hard compound work.'
    case 'working':
      return 'Systemic fatigue is where a productive block should sit.'
    case 'high':
      return 'Systemic fatigue is high. Expect performance to dip; this is fine for a week before a deload and not otherwise.'
    case 'excessive':
      return 'Systemic fatigue is past what you are clearing. Cut compound volume or deload — adding hypertrophy sets will not help.'
  }
}

/* -------------------------------------------------------------------- */
/* Stimulus to fatigue                                                   */
/* -------------------------------------------------------------------- */

/**
 * The average stimulus-to-fatigue ratio of the work actually performed,
 * weighted by set count.
 *
 * Useful as a diagnostic rather than a target. A block sitting at 2.0 is
 * one where most of the volume is expensive compound work — fine for a
 * strength phase, a poor way to specialise on side delts.
 */
export function averageSfr(
  entries: readonly { readonly exercise: Exercise; readonly workingSets: number }[],
): number | undefined {
  const counted = entries.filter((entry) => entry.workingSets > 0)
  if (counted.length === 0) return undefined

  const sets = counted.reduce((sum, entry) => sum + entry.workingSets, 0)
  if (sets === 0) return undefined

  const weighted = counted.reduce((sum, entry) => sum + entry.exercise.sfr * entry.workingSets, 0)

  return Number((weighted / sets).toFixed(2))
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
