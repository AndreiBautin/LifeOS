import type { ProgramTemplate } from '@/domain/programs/program'

/**
 * Where a program goes next.
 *
 * A program is a queue, not a calendar. Both source apps derived the
 * current day from days elapsed since the start date, so the first missed
 * Tuesday put them permanently out of step and there was no way back
 * except editing the start date. Here nothing moves until something
 * happens — finishing a session, or explicitly skipping one.
 *
 * Pure, and separate from the reason it is being advanced, so that
 * finishing and skipping cannot drift apart. They differ in what they
 * record, never in where they leave the lifter.
 */

export interface ProgramPositionState {
  readonly blockIndex: number
  readonly cycleNumber: number
  readonly weekIndex: number
  readonly dayIndex: number
}

export type AdvanceResult =
  | { readonly kind: 'moved'; readonly position: ProgramPositionState }
  /** Nothing left to run. The instance is finished. */
  | { readonly kind: 'finished' }
  /** The position does not exist in this template — nothing is changed. */
  | { readonly kind: 'invalid' }

export function nextPosition(
  program: ProgramTemplate,
  current: ProgramPositionState,
): AdvanceResult {
  const block = program.blocks[current.blockIndex]
  if (block === undefined) return { kind: 'invalid' }

  const week = block.weeks[current.weekIndex]
  if (week === undefined) return { kind: 'invalid' }

  const nextDay = current.dayIndex + 1
  if (nextDay < week.days.length) {
    return { kind: 'moved', position: { ...current, dayIndex: nextDay } }
  }

  const nextWeek = current.weekIndex + 1
  if (nextWeek < block.weeks.length) {
    return { kind: 'moved', position: { ...current, weekIndex: nextWeek, dayIndex: 0 } }
  }

  // The block is finished. Repeat it, or move on to the next.
  const repeats = block.repeat === 'indefinite' ? Number.POSITIVE_INFINITY : block.repeat
  if (current.cycleNumber < repeats) {
    return {
      kind: 'moved',
      position: {
        ...current,
        cycleNumber: current.cycleNumber + 1,
        weekIndex: 0,
        dayIndex: 0,
      },
    }
  }

  const nextBlock = current.blockIndex + 1
  if (nextBlock < program.blocks.length) {
    return {
      kind: 'moved',
      position: { blockIndex: nextBlock, cycleNumber: 1, weekIndex: 0, dayIndex: 0 },
    }
  }

  return { kind: 'finished' }
}
