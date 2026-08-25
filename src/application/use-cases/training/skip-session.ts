import { nextPosition, STARTING_POSITION } from '@/domain/programs/position'
import type { ProgramTemplate } from '@/domain/programs/program'
import type { Clock, PositionRepository, WorkoutRepository } from '@/domain/repositories/ports'

/**
 * Moving past a session without pretending it was trained.
 *
 * Needed the moment a program is a queue rather than a calendar: a day
 * trained elsewhere, or simply missed, has to be got past, and the only
 * alternatives are both wrong. Logging an empty workout puts a session
 * with no sets into the history, where it counts as a training day and
 * drags every frequency and volume figure down. Editing the instance by
 * hand is not something a lifter can do.
 *
 * So this writes no log at all. The day is not recorded as having
 * happened, because it did not.
 */

export interface SkipSessionDeps {
  readonly position: PositionRepository
  readonly workouts: WorkoutRepository
  /** The program, derived by the caller from the lifter's settings. */
  readonly program: ProgramTemplate
  readonly clock: Clock
}

export type SkipResult =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'no-program' }
  /** A session is already open. Finishing or abandoning it comes first. */
  | { readonly kind: 'session-in-progress' }

export async function skipSession(deps: SkipSessionDeps): Promise<SkipResult> {
  const open = await deps.workouts.inProgress()
  if (open !== undefined) return { kind: 'session-in-progress' }

  /*
   * A lifter who has never opened a session has no stored position, and
   * skipping is a perfectly reasonable first action — a week starting on
   * a Wednesday, say. Defaulting to the beginning means the skip lands on
   * day two rather than reporting that there is no program, which under a
   * derived program is never true.
   */
  const current = (await deps.position.get()) ?? {
    ...STARTING_POSITION,
    startedAt: deps.clock.now().toISOString(),
  }

  const result = nextPosition(deps.program, current)
  if (result.kind === 'invalid') return { kind: 'no-program' }

  await deps.position.save(result.position)
  return { kind: 'skipped' }
}
