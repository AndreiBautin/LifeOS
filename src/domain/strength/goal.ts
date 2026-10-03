import { parseDay } from '@/domain/time/day'

import { fitTrend } from './projection'
import type { TrendLift, TrendPoint } from './trend'

/**
 * A lift goal with a date: "bench 275 by March".
 *
 * **Judged against the trend line, not the last session.** One heavy day
 * does not put a goal on pace and one bad day does not put it behind —
 * the same fitted line the Strength card reads its "at this rate" date
 * from (`fitTrend`). Where there is not enough to fit, the goal still
 * says what it needs a week, which is arithmetic rather than a forecast.
 *
 * `from` is where the lift stood when the goal was set, so the glide path
 * has a start that does not move as the lift does.
 */
export interface LiftGoal {
  readonly load: number
  /** The deadline, a day key. */
  readonly by: string
  /** The day it was set, and what the lift measured then. */
  readonly setOn: string
  readonly from: number
}

export type LiftGoals = Readonly<Partial<Record<TrendLift, LiftGoal>>>

export type GoalStanding =
  | { readonly kind: 'met'; readonly now: number }
  | { readonly kind: 'missed'; readonly now: number | undefined }
  | {
      readonly kind: 'on-pace' | 'behind'
      readonly now: number
      /** Where the line reaches by the deadline. */
      readonly projected: number
      readonly neededPerWeek: number
      readonly ratePerWeek: number
    }
  | { readonly kind: 'unknown'; readonly now: number | undefined; readonly neededPerWeek: number }

export function goalStanding(
  points: readonly TrendPoint[],
  goal: LiftGoal,
  today: string,
): GoalStanding {
  const now = points.at(-1)?.value
  if (now !== undefined && now >= goal.load) return { kind: 'met', now }
  if (today > goal.by) return { kind: 'missed', now }

  const weeksLeft = Math.max(1 / 7, daysBetween(today, goal.by) / 7)
  const neededPerWeek = (goal.load - (now ?? goal.from)) / weeksLeft
  const fit = fitTrend(points)
  if (fit === undefined || now === undefined) return { kind: 'unknown', now, neededPerWeek }

  const projected = fit.fittedNow + fit.slopePerDay * daysBetween(fit.lastDate, goal.by)
  return {
    kind: projected >= goal.load ? 'on-pace' : 'behind',
    now,
    projected,
    neededPerWeek,
    ratePerWeek: fit.slopePerDay * 7,
  }
}

function daysBetween(from: string, to: string): number {
  return (parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000
}
