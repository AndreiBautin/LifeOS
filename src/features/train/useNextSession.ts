import { clampPosition, dayAt, weekAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'

import { usePosition, useProgram } from './hooks'

/**
 * Where the lifter is in the programme, and the day that comes next.
 *
 * Shared by the hero, which starts the session, and the plan card, which
 * shows what is in it — one answer to "what is next", read in one place,
 * so the two can never name different days.
 */
export function useNextSession() {
  const program = useProgram()
  const position = usePosition()

  const here =
    program.data === undefined
      ? undefined
      : clampPosition(program.data, position.data ?? { ...STARTING_POSITION, startedAt: '' })

  return {
    here,
    day: program.data === undefined || here === undefined ? undefined : dayAt(program.data, here),
    week: program.data === undefined || here === undefined ? undefined : weekAt(program.data, here),
    program: program.data,
  }
}

/**
 * "Monday — Push A" as its two halves.
 *
 * The routine names each day by the weekday it is planned for and what it
 * trains; the hero leads with the second and files the first beside the
 * week, because the session you are about to do is the headline and the
 * day it was planned for is context.
 */
export function splitDayLabel(label: string): { readonly name: string; readonly weekday?: string } {
  const [weekday, ...rest] = label.split(' — ')
  return rest.length === 0 || weekday === undefined
    ? { name: label }
    : { name: rest.join(' — '), weekday }
}
