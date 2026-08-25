import { nextPosition } from '@/domain/programs/advance'
import type { Clock, InstanceRepository, WorkoutRepository } from '@/domain/repositories/ports'

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
  readonly instances: InstanceRepository
  readonly workouts: WorkoutRepository
  readonly clock: Clock
}

export type SkipResult =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'finished' }
  | { readonly kind: 'no-program' }
  /** A session is already open. Finishing or abandoning it comes first. */
  | { readonly kind: 'session-in-progress' }

export async function skipSession(deps: SkipSessionDeps): Promise<SkipResult> {
  const open = await deps.workouts.inProgress()
  if (open !== undefined) return { kind: 'session-in-progress' }

  const instance = await deps.instances.active()
  if (instance === undefined) return { kind: 'no-program' }

  const result = nextPosition(instance.templateSnapshot, instance)

  switch (result.kind) {
    case 'invalid':
      return { kind: 'no-program' }
    case 'moved':
      await deps.instances.save({ ...instance, ...result.position })
      return { kind: 'skipped' }
    case 'finished':
      await deps.instances.save({
        ...instance,
        status: 'completed',
        completedAt: deps.clock.now().toISOString(),
      })
      return { kind: 'finished' }
  }
}
