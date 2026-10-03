import type { SlotRole } from './program'

/**
 * How long to rest after a set, from what the set was.
 *
 * Every rest was two minutes. That is long for a lateral raise and short
 * for a squat triple — a heavy lift wants the nervous system back, a set
 * of twenty wants only the breath back — so a flat number was right for
 * nothing and was overridden by hand on both ends of every session.
 *
 * **The rest is for the work coming, so the last set of an exercise rests
 * for the next one.** Two minutes after the final curl leads into a squat,
 * and the squat is what decides how long you need.
 *
 * **A set that fell short of its planned reps earns thirty seconds
 * more** before the next set of the same exercise. Missing the plan means
 * the set cost more than planned; the next one is the one to recover for.
 * It is the only adjustment, and it is said on the timer so a longer rest
 * is never a mystery.
 */
export const REST_SECONDS = { heavy: 180, compound: 120, isolation: 90 } as const
export const SHORT_SET_EXTRA_SECONDS = 30

export interface RestWork {
  readonly role: SlotRole
  readonly isCompound: boolean
  /** An exercise's own rest, where the catalogue states one. */
  readonly restSeconds?: number | undefined
}

export interface RestPlan {
  /** Zero means no timer at all. */
  readonly seconds: number
  /** Why this long, in a word or two for the timer. */
  readonly reason: string
}

export function restAfter(args: {
  readonly work: RestWork
  /** The next exercise, when this was the last set of the one before it. */
  readonly next?: RestWork | undefined
  readonly lastOfExercise: boolean
  readonly plannedReps?: number | undefined
  readonly doneReps?: number | undefined
}): RestPlan {
  const subject = args.lastOfExercise ? args.next : args.work
  if (subject === undefined) return { seconds: 0, reason: '' }
  const base = baseRest(subject)
  if (base.seconds === 0) return base

  const short =
    !args.lastOfExercise &&
    args.plannedReps !== undefined &&
    args.doneReps !== undefined &&
    args.doneReps < args.plannedReps
  // A word or two: the timer's label column is about a hundred pixels at
  // 375, and its "Up next" line already names what the rest leads into.
  return short ? { seconds: base.seconds + SHORT_SET_EXTRA_SECONDS, reason: 'Short set' } : base
}

function baseRest(work: RestWork): RestPlan {
  switch (work.role) {
    case 'warmup':
    case 'conditioning':
      return { seconds: 0, reason: '' }
    case 'main':
    case 'strength':
      return { seconds: REST_SECONDS.heavy, reason: 'Heavy lift' }
    case 'hypertrophy':
    case 'assistance':
      // An exercise's own rest wins on time; the kind still names it.
      return {
        seconds:
          work.restSeconds !== undefined && work.restSeconds > 0
            ? work.restSeconds
            : work.isCompound
              ? REST_SECONDS.compound
              : REST_SECONDS.isolation,
        reason: work.isCompound ? 'Compound' : 'Isolation',
      }
  }
}
