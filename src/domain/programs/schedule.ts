import type { ProgramDay, ProgramTemplate } from '@/domain/programs/program'
import { parseDay, shiftDay } from '@/domain/time/day'

/**
 * Which session a date holds, read off the calendar.
 *
 * **This replaced a cursor, and reverses a rule that stood since the
 * first commit.** The program used to be a queue: finishing or skipping a
 * session moved a stored position on by one, on the reasoning that two
 * predecessor apps keyed sessions to weekdays and "drifted permanently out
 * of step the first time a lifter missed a Tuesday". That was right while
 * a day was a slot in a generated week. It stopped being right when the
 * week became the lifter's own routine, written by weekday — Push A is a
 * Monday — at which point a missed Tuesday is simply a missed Tuesday,
 * and a queue that holds Pull A over until Wednesday is the drift.
 *
 * Asked for as _"the app knows what day it is and the workouts each map
 * to a day so we should use that rather than keeping a cursor"_. The
 * cursor was also the one record with no correct merge across devices —
 * it is what read Push A on a phone and Pull B on a desktop.
 *
 * **What is still stored is one date: the Monday the block began.** The
 * day comes from the weekday; the week of the block, and the cycle, come
 * from whole weeks since that Monday. It changes only when the lifter
 * says which week they are in, so two devices cannot disagree about it.
 */

/** Where a date falls in the program. */
export interface ScheduledSlot {
  readonly cycleNumber: number
  readonly blockIndex: number
  readonly weekIndex: number
}

export interface ScheduledSession extends ScheduledSlot {
  readonly dayIndex: number
  readonly day: ProgramDay
  /** The day key the session is scheduled on. */
  readonly on: string
}

const DAY_MS = 86_400_000

/** Sunday-indexed, like `Date.getDay()`. */
function weekdayOfKey(key: string): number {
  return parseDay(key).getUTCDay()
}

/** The Monday of the week a day key falls in. */
export function mondayOf(key: string): string {
  return shiftDay(key, -((weekdayOfKey(key) + 6) % 7))
}

/**
 * The weekday a program day is run on.
 *
 * Stated by the split for the shipped routine. A day with none — a
 * generated week — is laid out from Monday in order, which is how the
 * labels of every generated split already read.
 */
export function weekdayOf(day: ProgramDay): number {
  return day.weekday ?? (day.index + 1) % 7
}

/** Every week of the program in order, across blocks. */
function weeksOf(program: ProgramTemplate) {
  return program.blocks.flatMap((block, blockIndex) =>
    block.weeks.map((week, weekIndex) => ({ blockIndex, weekIndex, week })),
  )
}

/**
 * The week of the program a date falls in.
 *
 * Whole weeks since the block's Monday, wrapping into the next cycle once
 * the program has run through. A date before the block began reads as
 * its first week rather than as nothing — the anchor is a statement about
 * where the lifter is now, and the past is not what it is for.
 */
export function slotOn(
  program: ProgramTemplate,
  blockStartedOn: string,
  on: string,
): ScheduledSlot | undefined {
  const weeks = weeksOf(program)
  if (weeks.length === 0) return undefined

  const elapsed = Math.round(
    (parseDay(mondayOf(on)).getTime() - parseDay(mondayOf(blockStartedOn)).getTime()) / DAY_MS / 7,
  )
  const since = Math.max(0, elapsed)
  const here = weeks[since % weeks.length]
  if (here === undefined) return undefined

  return {
    cycleNumber: Math.floor(since / weeks.length) + 1,
    blockIndex: here.blockIndex,
    weekIndex: here.weekIndex,
  }
}

/** The session a date holds, or undefined on a rest day. */
export function sessionOn(
  program: ProgramTemplate,
  blockStartedOn: string,
  on: string,
): ScheduledSession | undefined {
  const slot = slotOn(program, blockStartedOn, on)
  if (slot === undefined) return undefined

  const week = program.blocks[slot.blockIndex]?.weeks[slot.weekIndex]
  const weekday = weekdayOfKey(on)
  const dayIndex = week?.days.findIndex((day) => weekdayOf(day) === weekday) ?? -1
  const day = week?.days[dayIndex]
  if (day === undefined) return undefined

  return { ...slot, dayIndex, day, on }
}

/**
 * The first scheduled session on or after a date.
 *
 * Bounded at a fortnight rather than a `while`: a program whose days name
 * no weekday at all would otherwise be searched forever.
 */
export function sessionFrom(
  program: ProgramTemplate,
  blockStartedOn: string,
  from: string,
): ScheduledSession | undefined {
  for (let offset = 0; offset < 14; offset += 1) {
    const found = sessionOn(program, blockStartedOn, shiftDay(from, offset))
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * The block start that puts a date in a given week of the program.
 *
 * What "I am in week three" writes, and how a stored position from the
 * cursor era is read: the Monday that many weeks back, counting earlier
 * cycles in full.
 */
export function blockStartFor(program: ProgramTemplate, slot: ScheduledSlot, on: string): string {
  const weeks = weeksOf(program)
  const offset = Math.max(
    0,
    weeks.findIndex(
      (week) => week.blockIndex === slot.blockIndex && week.weekIndex === slot.weekIndex,
    ),
  )
  const back = offset + weeks.length * Math.max(0, slot.cycleNumber - 1)
  return shiftDay(mondayOf(on), -7 * back)
}
