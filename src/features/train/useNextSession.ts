import { slotOn } from '@/domain/programs/schedule'
import { shiftDay } from '@/domain/time/day'

import { useProgram, useSchedule } from './hooks'

/**
 * What the calendar offers next, and the week it falls in.
 *
 * Shared by the hero, which starts the session, the plan card, which
 * shows what is in it, and the week card — one answer to "what is next",
 * read in one place, so they can never name different days. The day comes
 * from the date; see `domain/programs/schedule.ts`.
 */
export function useNextSession() {
  const program = useProgram()
  const schedule = useSchedule()

  const data = schedule.data
  const next = data?.next
  const week =
    next === undefined ? undefined : program.data?.blocks[next.blockIndex]?.weeks[next.weekIndex]

  /*
   * The week *today* is in, which is not always the week of the next
   * session: on a Sunday the next session is Monday's, in the week after.
   * The week card judges this week's work, so it reads this.
   */
  const thisSlot =
    program.data === undefined || data === undefined
      ? undefined
      : slotOn(program.data, data.blockStartedOn, data.today)
  const thisWeek =
    thisSlot === undefined
      ? undefined
      : program.data?.blocks[thisSlot.blockIndex]?.weeks[thisSlot.weekIndex]

  return {
    program: program.data,
    day: next?.day,
    week,
    thisWeek,
    /** Cycle, block, week and day of the next session. */
    here: next,
    /** The day key the next session is scheduled on. */
    on: next?.on,
    when: data === undefined || next === undefined ? undefined : whenOf(next.on, data.today),
    doneToday: data?.doneToday === true,
    restDay: data !== undefined && data.todays === undefined,
  }
}

/** "today", "tomorrow" or a weekday name, for a day key relative to today. */
function whenOf(on: string, today: string): 'today' | 'tomorrow' | 'later' {
  if (on === today) return 'today'
  if (on === shiftDay(today, 1)) return 'tomorrow'
  return 'later'
}

/**
 * "Monday — Push A" as its two halves.
 *
 * The routine names each day by the weekday it is run on and what it
 * trains; the hero leads with the second and files the first beside the
 * week, because the session you are about to do is the headline and the
 * day it falls on is context.
 */
export function splitDayLabel(label: string): { readonly name: string; readonly weekday?: string } {
  const [weekday, ...rest] = label.split(' — ')
  return rest.length === 0 || weekday === undefined
    ? { name: label }
    : { name: rest.join(' — '), weekday }
}
