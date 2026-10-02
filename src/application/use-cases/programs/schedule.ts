import type { ProgramPosition } from '@/domain/programs/position'
import type { ProgramTemplate } from '@/domain/programs/program'
import {
  blockStartFor,
  mondayOf,
  sessionFrom,
  sessionOn,
  type ScheduledSession,
} from '@/domain/programs/schedule'
import type { Clock, PositionRepository, WorkoutRepository } from '@/domain/repositories/ports'
import { localDayOf, shiftDay, toDayKey } from '@/domain/time/day'

/**
 * Today, as the calendar sees it: the session it holds, whether it is
 * done, and what to offer next. See `domain/programs/schedule.ts` for why
 * the day comes from the date.
 */
export interface Schedule {
  readonly today: string
  /** The Monday the block began, as a day key. */
  readonly blockStartedOn: string
  /** Today's session, or undefined on a rest day. */
  readonly todays?: ScheduledSession
  /** Today's session has a finished log. */
  readonly doneToday: boolean
  /**
   * What starting a session opens: today's until it is done, then the
   * next one the calendar holds — so a rest day or a finished day offers
   * tomorrow's rather than nothing.
   */
  readonly next?: ScheduledSession
}

export interface ScheduleDeps {
  readonly position: PositionRepository
  readonly workouts: WorkoutRepository
  readonly clock: Clock
}

/**
 * The block's Monday, from whatever is stored.
 *
 * A position written by the cursor has no `blockStartedOn`; it is read as
 * "the week it pointed at, on the day it last moved", which keeps a lifter
 * in week six in week six across the change rather than sending them back
 * to week one. A device with nothing stored starts its block this week.
 */
export function blockStartOf(
  program: ProgramTemplate,
  stored: ProgramPosition | undefined,
  today: string,
): string {
  if (stored === undefined) return mondayOf(today)
  if (stored.blockStartedOn !== undefined) return stored.blockStartedOn
  return blockStartFor(program, stored, localDayOf(stored.updatedAt ?? stored.startedAt))
}

export async function scheduleFor(program: ProgramTemplate, deps: ScheduleDeps): Promise<Schedule> {
  const today = toDayKey(deps.clock.now())
  const [stored, recent] = await Promise.all([deps.position.get(), deps.workouts.recent(20)])
  const blockStartedOn = blockStartOf(program, stored, today)

  const todays = sessionOn(program, blockStartedOn, today)
  const doneToday =
    todays !== undefined &&
    recent.some(
      (log) =>
        log.status === 'completed' &&
        log.date === today &&
        log.position?.blockIndex === todays.blockIndex &&
        log.position.weekIndex === todays.weekIndex &&
        log.position.dayIndex === todays.dayIndex,
    )

  const next =
    todays !== undefined && !doneToday
      ? todays
      : sessionFrom(program, blockStartedOn, shiftDay(today, 1))

  return {
    today,
    blockStartedOn,
    ...(todays === undefined ? {} : { todays }),
    doneToday,
    ...(next === undefined ? {} : { next }),
  }
}
