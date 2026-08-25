import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  deleteWorkout,
  type DeleteWorkoutResult,
} from '@/application/use-cases/training/delete-workout'
import type { WorkoutId } from '@/domain/ids/ids'
import { logger } from '@/shared/logging/logger'

/**
 * Removing a session from the history.
 *
 * Invalidates the workout queries and nothing else — the program is
 * derived from settings and the position is stored separately, so neither
 * can be affected by a log going away. That independence is the point of
 * keeping the program out of the log.
 */
export function useDeleteWorkout() {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<DeleteWorkoutResult, Error, WorkoutId>({
    mutationFn: (workoutId) => deleteWorkout(workoutId, services),
    onSuccess: (result) => {
      logger.info('workout.delete', {
        outcome: result.kind,
        workingSets: result.kind === 'deleted' ? result.workingSets : 0,
      })
      void client.invalidateQueries({ queryKey: ['workouts'] })
    },
  })
}
