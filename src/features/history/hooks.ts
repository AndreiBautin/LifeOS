import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  deleteWorkout,
  type DeleteWorkoutResult,
} from '@/application/use-cases/training/delete-workout'
import {
  reopenWorkout,
  type ReopenWorkoutResult,
} from '@/application/use-cases/training/reopen-workout'
import { sessionDetail } from '@/application/use-cases/training/session-detail'
import { noteWorkout } from '@/application/use-cases/training/note-workout'
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

/**
 * Putting a mis-finished session back on the Train screen.
 *
 * Invalidates the position as well as the workouts, which is the one way
 * this differs from deleting: reopening moves the program back to the day
 * the session belongs to, so anything reading "where am I" is stale until
 * it refetches.
 */
export function useReopenWorkout() {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<ReopenWorkoutResult, Error, WorkoutId>({
    mutationFn: (workoutId) => reopenWorkout(workoutId, services),
    onSuccess: (result) => {
      logger.info('workout.reopen', { outcome: result.kind })
      void client.invalidateQueries({ queryKey: ['workouts'] })
      void client.invalidateQueries({ queryKey: ['position'] })
    },
  })
}

/** One past session, read in full. Under `workouts`, so a delete refreshes it. */
export function useSessionDetail(id: WorkoutId) {
  const services = useServices()
  return useQuery({
    queryKey: ['workouts', 'detail', id],
    queryFn: () => sessionDetail(id, services).then((detail) => detail ?? null),
  })
}

/** A line about the whole session; see `noteWorkout`. */
export function useNoteWorkout() {
  const services = useServices()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { readonly id: WorkoutId; readonly notes: string }) =>
      noteWorkout(input.id, input.notes, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['workouts'] })
    },
  })
}
