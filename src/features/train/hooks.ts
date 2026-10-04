import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { pairSuperset, unpairSuperset } from '@/application/use-cases/training/superset'
import { muscleBalance } from '@/application/use-cases/training/balance'
import { recentMuscles } from '@/application/use-cases/training/recency'
import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import { exerciseHistory } from '@/domain/logging/exercise-history'
import { workingSets } from '@/domain/logging/workout-log'
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
  withSetResult,
} from '@/application/use-cases/training/log-set'
import {
  startWorkout,
  type StartWorkoutResult,
} from '@/application/use-cases/training/start-workout'
import { deriveProgram, jumpToWeek } from '@/application/use-cases/programs/current-program'
import type { ProgramTemplate } from '@/domain/programs/program'
import { useServices, useSettings } from '@/app/context'
import { activityFor } from '@/application/use-cases/training/activity'
import { weekSummary } from '@/application/use-cases/training/week'
import { scheduleFor } from '@/application/use-cases/programs/schedule'
import { previewWorkout } from '@/application/use-cases/training/start-workout'
import { swapExercise, swapOptions } from '@/application/use-cases/training/swap-exercise'
import type { LogEntry } from '@/domain/logging/workout-log'
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

/**
 * Working sets per day for the training grid. Keyed under `workouts`, so
 * finishing, deleting or reopening a session refreshes it with the rest.
 */
export function useActivity() {
  const services = useServices()
  return useQuery({ queryKey: ['workouts', 'activity'], queryFn: () => activityFor(services) })
}

/**
 * Which session today holds, and what to offer next — the calendar's
 * answer, read from the date. Keyed under `workouts`, because finishing a
 * session is what turns "today's" into "tomorrow's".
 */
export function useSchedule() {
  const services = useServices()
  const program = useProgram()

  return useQuery({
    queryKey: ['workouts', 'schedule', program.data?.id, program.dataUpdatedAt],
    queryFn: () => {
      if (program.data === undefined) throw new Error('The program is still loading.')
      return scheduleFor(program.data, services)
    },
    enabled: program.data !== undefined,
  })
}

/** This calendar week so far, and the weekly streak. Keyed under `workouts` like the grid. */
export function useWeekSummary() {
  const services = useServices()
  return useQuery({ queryKey: ['workouts', 'week'], queryFn: () => weekSummary(services) })
}

/** Push and pull, quads and hinge, upper and lower, over four weeks. */
export function useMuscleBalance() {
  const services = useServices()
  return useQuery({ queryKey: ['workouts', 'balance'], queryFn: () => muscleBalance(services) })
}

/** How long ago each muscle last worked, and its sets this past week. */
export function useMuscleRecency() {
  const services = useServices()
  return useQuery({ queryKey: ['workouts', 'recency'], queryFn: () => recentMuscles(services) })
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
          ...(settings.loadResets !== undefined ? { resets: settings.loadResets } : {}),
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
  const { settings } = useSettings()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { entryIndex: number; setIndex: number; result: SetResult }) => {
      if (workoutId === undefined) throw new Error('No workout is open.')
      return logSet(
        { workoutId, ...input },
        {
          ...services,
          roundingIncrement: settings.roundingIncrement,
        },
      )
    },
    /*
     * **The set lands on screen before the save does.** Logging waited on
     * IndexedDB and then a refetch before the row turned green — a beat
     * long enough to tap twice. The result is written into the cached
     * workout by the same function the save uses (`withSetResult`), so
     * what shows cannot differ from what is stored; a failed save puts
     * the old workout back, and the player says so.
     */
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: keys.activeWorkout })
      const before = client.getQueryData<WorkoutLog | null>(keys.activeWorkout)
      if (before != null) {
        client.setQueryData(keys.activeWorkout, withSetResult(before, input, services.clock.now()))
      }
      return { before }
    },
    onError: (error, _input, context) => {
      logger.warn('set.log-failed', { message: error.message })
      if (context !== undefined) client.setQueryData(keys.activeWorkout, context.before)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
    },
  })
}

/** Alternatives to the current exercise, with what each did last time. */
export function useSwapOptions(entry: LogEntry | undefined, enabled: boolean) {
  const services = useServices()
  return useQuery({
    queryKey: ['workouts', 'swap-options', entry?.exerciseId, entry?.substitutedFor],
    queryFn: () => (entry === undefined ? [] : swapOptions(entry, services)),
    enabled: enabled && entry !== undefined,
  })
}

/** Pairs an accessory with the next one, or splits the pair it is in. */
export function useSuperset(workoutId: WorkoutId | undefined) {
  const services = useServices()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { entryIndex: number; pair: boolean }) => {
      if (workoutId === undefined) throw new Error('No workout is open.')
      return input.pair
        ? pairSuperset(workoutId, input.entryIndex, services)
        : unpairSuperset(workoutId, input.entryIndex, services)
    },
    onSuccess: (updated) => {
      client.setQueryData(keys.activeWorkout, updated)
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
    },
  })
}

export function useSwapExercise(workoutId: WorkoutId | undefined) {
  const services = useServices()
  const { settings } = useSettings()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { entryIndex: number; exerciseId: ExerciseId }) => {
      if (workoutId === undefined) throw new Error('No workout is open.')
      return swapExercise(
        {
          workoutId,
          ...input,
          ...(settings.loadResets !== undefined ? { resets: settings.loadResets } : {}),
        },
        services,
      )
    },
    onSuccess: (updated) => {
      client.setQueryData(keys.activeWorkout, updated)
      void client.invalidateQueries({ queryKey: keys.activeWorkout })
    },
    onError: (error) => {
      logger.warn('exercise.swap-failed', { message: error.message })
    },
  })
}

export function useClearSet(workoutId: WorkoutId | undefined) {
  const services = useServices()
  const { settings } = useSettings()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { entryIndex: number; setIndex: number }) => {
      if (workoutId === undefined) throw new Error('No workout is open.')
      return clearSet(
        { workoutId, ...input },
        {
          ...services,
          roundingIncrement: settings.roundingIncrement,
        },
      )
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

/**
 * Moves the block to the start of a chosen week.
 *
 * The only way, other than training, to change where the lifter is — and
 * necessary because someone arriving mid-block would otherwise have to
 * skip their way to the right week.
 */
export function useJumpToWeek() {
  const services = useServices()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ program, weekIndex }: { program: ProgramTemplate; weekIndex: number }) =>
      jumpToWeek(program, weekIndex, services),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['position'] })
      void queryClient.invalidateQueries({ queryKey: ['workouts'] })
      void queryClient.invalidateQueries({ queryKey: keys.activeWorkout })
    },
  })
}

/**
 * The session Start would open, planned now for the home page's outline.
 *
 * Keyed under `workouts` so every mutation that files, deletes or
 * abandons a session — which is what moves a planned load — refreshes
 * it too; the athlete and the rounding are in the key because they move
 * it as well.
 */
export function useSessionPreview() {
  const services = useServices()
  const { athlete, settings } = useSettings()
  const program = useProgram()

  return useQuery({
    queryKey: ['workouts', 'preview', settings.roundingIncrement, athlete, settings.loadResets],
    enabled: program.data !== undefined,
    queryFn: async () => {
      if (program.data === undefined) return null
      const planned = await previewWorkout(
        {
          athlete,
          program: program.data,
          roundingIncrement: settings.roundingIncrement,
          ...(settings.loadResets !== undefined ? { resets: settings.loadResets } : {}),
        },
        services,
      )
      return planned ?? null
    },
  })
}

/**
 * Every finished set of an exercise outside the open session — what a set
 * logged now has to beat to be a personal record. Under `workouts`, so
 * finishing or deleting a session refreshes it.
 */
export function usePriorSets(exerciseId: ExerciseId, currentWorkoutId: WorkoutId) {
  const services = useServices()
  return useQuery({
    queryKey: ['workouts', 'prior-sets', exerciseId, currentWorkoutId],
    queryFn: async () =>
      (await services.workouts.forExercise(exerciseId))
        .filter((log) => log.id !== currentWorkoutId && log.status === 'completed')
        .flatMap((log) => log.entries.filter((entry) => entry.exerciseId === exerciseId))
        .flatMap((entry) => workingSets(entry))
        .map((set) => ({ load: set.actualLoad, reps: set.actualReps })),
  })
}

/** One exercise across its sessions, by version — the exercise page's own read. */
export function useExerciseHistory(exerciseId: ExerciseId) {
  const services = useServices()
  return useQuery({
    queryKey: ['workouts', 'exercise', exerciseId],
    queryFn: async () =>
      exerciseHistory(await services.workouts.forExercise(exerciseId), exerciseId),
  })
}
