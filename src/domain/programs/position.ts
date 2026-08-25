import type { ProgramTemplate } from '@/domain/programs/program'

/**
 * Where the lifter is in their program — and the only thing about a
 * program that is stored.
 *
 * The program itself is *derived* from settings, every time it is needed.
 * It used to be stored, alongside a library of other programs and a
 * frozen snapshot per run, and that arrangement produced the same bug
 * four times in a row: a change to how blocks are built reached the code
 * and not the copy on the device. Each fix — additively syncing, then
 * refreshing on content change, then retiring withdrawals, then
 * re-snapshotting an untrained run — patched one route and left the
 * others open.
 *
 * Deriving it removes the class of bug rather than the instances. There
 * is no stored copy to go stale, so a tier moved in Settings is visible
 * in the next session with nothing to press.
 *
 * What made the stored snapshot seem necessary was protecting history
 * from an edited program. It never was: a `WorkoutLog` embeds the
 * prescription, planned load and planned reps of every set it contains,
 * so a logged session describes itself completely and owes the template
 * nothing.
 */

export interface ProgramPosition {
  /** How many times the block has been completed and restarted. */
  readonly cycleNumber: number
  readonly blockIndex: number
  readonly weekIndex: number
  readonly dayIndex: number
  readonly startedAt: string
}

export const STARTING_POSITION: Omit<ProgramPosition, 'startedAt'> = {
  cycleNumber: 1,
  blockIndex: 0,
  weekIndex: 0,
  dayIndex: 0,
}

export type AdvanceResult =
  | { readonly kind: 'moved'; readonly position: ProgramPosition }
  /** The block finished and repeats, so the cycle number went up. */
  | { readonly kind: 'cycled'; readonly position: ProgramPosition }
  /** The position does not exist in this program — nothing is changed. */
  | { readonly kind: 'invalid' }

/**
 * Where the program goes next.
 *
 * A program is a queue, not a calendar. Both source apps derived the
 * current day from days elapsed since the start date, so the first missed
 * Tuesday put them permanently out of step with no way back except
 * editing the start date. Here nothing moves until something happens —
 * finishing a session, or explicitly skipping one.
 *
 * Pure, and separate from the reason it is being advanced, so finishing
 * and skipping cannot drift apart. They differ in what they record, never
 * in where they leave the lifter.
 */
export function nextPosition(program: ProgramTemplate, current: ProgramPosition): AdvanceResult {
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

  const nextBlock = current.blockIndex + 1
  if (nextBlock < program.blocks.length) {
    return {
      kind: 'moved',
      position: { ...current, blockIndex: nextBlock, weekIndex: 0, dayIndex: 0 },
    }
  }

  /*
   * The whole program is done, so it starts again with the cycle number
   * up by one.
   *
   * There is no "finished" state any more. A block that ends used to
   * complete its run and leave the lifter on a screen saying so, with a
   * library to go and pick from — and there is no library now. Training
   * continues; the deload is what marks the boundary.
   */
  return {
    kind: 'cycled',
    position: {
      ...current,
      cycleNumber: current.cycleNumber + 1,
      blockIndex: 0,
      weekIndex: 0,
      dayIndex: 0,
    },
  }
}
