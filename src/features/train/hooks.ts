import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import {
  abandonWorkout,
  type AbandonResult,
} from '@/application/use-cases/training/abandon-workout'
import { finishWorkout, type WorkoutReport } from '@/application/use-cases/training/finish-workout'
import {
  clearSet,
  logSet,
  previousSetFor,
  type PreviousSet,
  type SetResult,
} from '@/application/use-cases/training/log-set'
import { skipSession, type SkipResult } from '@/application/use-cases/training/skip-session'
import {
  startWorkout,
  type StartWorkoutResult,
} from '@/application/use-cases/training/start-workout'
import { deriveProgram } from '@/application/use-cases/programs/current-program'
import { useServices, useSettings } from '@/app/context'
import { logger } from '@/shared/logging/logger'

/**
 * Query hooks for the training flow.
 *
 * Every one resolves its use-case from the injected services rather than
 * importing a repository, so the layer rule holds at runtime. Cache keys
 * are coarse — the app is single-user and offline, so there is no
 * contention to be clever about, and an over-invalidated query costs an
 * IndexedDB read.
 */

/**
 * The program, derived from settings.
 *
 * Memoised per settings object rather than stored. Assembly is a few
 * milliseconds of pure computation over a fixed catalogue, and paying it
 * on render is what buys the guarantee that nothing can be stale.
 */
export function useProgram() {
  const services = useServices()
  const { settings } = useSettings()

  return useQuery({
    queryKey: ['program', settings],
    queryFn: async () => deriveProgram(settings, await services.exercises.all()),
    staleTime: Infinity,
  })
}

export function usePosition() {
  const services = useServices()

  return useQuery({
    queryKey: ['position'],
    queryFn: () => services.position.get().then((position) => position ?? null),
  })
}

const keys = {
  activeWorkout: ['workout', 'active'] as const,
  workout: (id: WorkoutId) => ['workout', id] as const,
  recent: (limit: number) => ['workouts', 'recent', limit] as const,
  exercises: ['exercises'] as const,
  programs: ['programs'] as const,
  previousSet: (exerciseId: ExerciseId, setIndex: number, variant: string) =>
    ['previous-set', exerciseId, setIndex, variant] as const,
}

export function useActiveWorkout() {
  const services = useServices()

  return useQuery({
    queryKey: keys.activeWorkout,
    queryFn: () => services.workouts.inProgress().then((workout) => workout ?? null),
  })
}

export function useExercises() {
  const services = useServices()

  return useQuery({ queryKey: keys.exercises, queryFn: () => services.exercises.all() })
}

export function useRecentWorkouts(limit = 20) {
  const services = useServices()

  return useQuery({ queryKey: keys.recent(limit), queryFn: () => services.workouts.recent(limit) })
}

export function useStartWorkout() {
  const services = useServices()
  const { athlete, settings } = useSettings()
  const program = useProgram()
  const client = useQueryClient()

  return useMutation<StartWorkoutResult, Error, { freestyleTitle?: string } | undefined>({
    mutationFn: (options) => {
      if (program.data === undefined) throw new Error('The program is still loading.')

      return startWorkout(
        {
          athlete,
          program: program.data,
          roundingIncrement: settings.roundingIncrement,
          ...(options?.freestyleTitle !== undefined
            ? { freestyleTitle: options.freestyleTitle }
            : {}),
        },
        services,
      )
    },
    onSuccess: (result) => {
      logger.info('workout.start', { kind: result.kind })
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
    },
  })
}

export function useLogSet(workoutId: WorkoutId | undefined) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { entryIndex: number; setIndex: number; result: SetResult }) => {
      if (workoutId === undefined) throw new Error('No workout is open.')
      return logSet({ workoutId, ...input }, services)
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
    },
  })
}

export function useClearSet(workoutId: WorkoutId | undefined) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { entryIndex: number; setIndex: number }) => {
      if (workoutId === undefined) throw new Error('No workout is open.')
      return clearSet({ workoutId, ...input }, services)
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
    },
  })
}

export function useFinishWorkout() {
  const services = useServices()
  const program = useProgram()
  const client = useQueryClient()

  return useMutation<WorkoutReport, Error, WorkoutId>({
    mutationFn: (workoutId) => {
      if (program.data === undefined) throw new Error('The program is still loading.')
      return finishWorkout(workoutId, { ...services, program: program.data })
    },
    onSuccess: (report) => {
      logger.info('workout.finish', {
        workingSets: report.workingSets,
        durationMinutes: report.durationMinutes,
      })
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
      void client.invalidateQueries({ queryKey: ['position'] })
      void client.invalidateQueries({ queryKey: ['workouts'] })
    },
  })
}

/**
 * Walks away from an open session.
 *
 * Discards it outright when nothing was logged, and keeps it marked
 * `abandoned` when something was. Either way the program stays on the
 * day, because the day was not finished.
 */
export function useAbandonWorkout() {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<AbandonResult, Error, WorkoutId>({
    mutationFn: (workoutId) => abandonWorkout(workoutId, services),
    onSuccess: (result) => {
      logger.info('workout.abandon', { outcome: result.kind })
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
      void client.invalidateQueries({ queryKey: ['workouts'] })
    },
  })
}

/**
 * Moves past a session without logging one.
 *
 * Deliberately writes nothing to the history: a skipped day did not
 * happen, and an empty workout in the log would count as a training day
 * against every frequency and volume figure.
 */
export function useSkipSession() {
  const services = useServices()
  const program = useProgram()
  const client = useQueryClient()

  return useMutation<SkipResult>({
    mutationFn: () => {
      if (program.data === undefined) throw new Error('The program is still loading.')
      return skipSession({ ...services, program: program.data })
    },
    onSuccess: (result) => {
      logger.info('session.skip', { outcome: result.kind })
      void client.invalidateQueries({ queryKey: ['position'] })
    },
  })
}

/**
 * What was done on this set the last time this lift was trained.
 *
 * Rendered as the input's placeholder, so beating last week is the path
 * of least resistance rather than something to remember. Carried from
 * LiftTracker, which had the idea right and the implementation wrong —
 * it loaded every microcycle ever run to find the number.
 */
export function usePreviousSet(
  exerciseId: ExerciseId | undefined,
  setIndex: number,
  currentWorkoutId: WorkoutId | undefined,
  /** Distinguishes the top-set row from the back-off row of the same lift. */
  variant?: string,
) {
  const services = useServices()

  return useQuery<PreviousSet | null>({
    queryKey: keys.previousSet(exerciseId ?? ('' as ExerciseId), setIndex, variant ?? ''),
    enabled: exerciseId !== undefined && currentWorkoutId !== undefined,
    queryFn: async () => {
      if (exerciseId === undefined || currentWorkoutId === undefined) return null
      const previous = await previousSetFor(
        exerciseId,
        setIndex,
        currentWorkoutId,
        services,
        variant,
      )
      return previous ?? null
    },
  })
}

export const trainingKeys = keys
