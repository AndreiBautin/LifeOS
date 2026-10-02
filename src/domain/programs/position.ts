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
  /**
   * The Monday the block began, as a day key — the one thing the calendar
   * needs stored. Which day it is comes from the date and which week of
   * the block from whole weeks since this; see `programs/schedule.ts`.
   *
   * Absent on every position written while the program was a cursor, and
   * read from the week that cursor pointed at; see `blockStartOf`. The
   * index fields stay, because that reading needs them and the sync file
   * already carries them.
   */
  readonly blockStartedOn?: string
  /**
   * When this position last moved, stamped by the repository on save.
   *
   * What lets two devices agree on where the lifter is: the sync file
   * carries the position, and the later move wins. Optional because every
   * position written before sync carried it has none, and an unstamped
   * position loses to any stamped one — the rule records already follow.
   */
  readonly updatedAt?: string
}

export const STARTING_POSITION: Omit<ProgramPosition, 'startedAt'> = {
  cycleNumber: 1,
  blockIndex: 0,
  weekIndex: 0,
  dayIndex: 0,
}
