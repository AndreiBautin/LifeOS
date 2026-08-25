import type { Exercise } from '@/domain/exercises/exercise'
import type { ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import {
  estimateFromWorkout,
  loggedVolume,
  totalTonnage,
  totalWorkingSets,
  workingSets,
} from '@/domain/logging/workout-log'
import type {
  Clock,
  ExerciseRepository,
  InstanceRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { nextPosition } from '@/domain/programs/advance'
import type { E1rmEstimate } from '@/domain/strength/one-rep-max'
import { displaySets, trainedMuscles } from '@/domain/volume/accounting'
import type { MuscleGroup } from '@/domain/exercises/taxonomy'

/**
 * Closing out a session, and saying something useful about it.
 *
 * StrengthFlow's post-workout report — "these exercises did not match or
 * beat last time" — was the best single sentence either old app produced,
 * and it is kept. What is added is the part that makes the check-in loop
 * mean anything: the volume this session actually contributed, per
 * muscle, counted by exactly the same rules the planner used.
 */

export interface FinishWorkoutDeps {
  readonly workouts: WorkoutRepository
  readonly instances: InstanceRepository
  readonly exercises: ExerciseRepository
  readonly clock: Clock
}

export interface ExerciseProgress {
  readonly exerciseId: ExerciseId
  readonly name: string
  readonly verdict: 'better' | 'matched' | 'worse' | 'new'
  readonly estimate?: E1rmEstimate
}

export interface WorkoutReport {
  readonly workout: WorkoutLog
  readonly durationMinutes: number
  readonly workingSets: number
  readonly tonnage: number
  readonly volumeByMuscle: readonly { readonly muscle: MuscleGroup; readonly sets: string }[]
  readonly progress: readonly ExerciseProgress[]
  readonly newEstimates: readonly {
    readonly exerciseId: ExerciseId
    readonly estimate: E1rmEstimate
  }[]
  readonly headline: string
}

export async function finishWorkout(
  workoutId: WorkoutId,
  deps: FinishWorkoutDeps,
): Promise<WorkoutReport> {
  const workout = await deps.workouts.byId(workoutId)
  if (workout === undefined) throw new Error(`No workout found with id ${workoutId}.`)

  const now = deps.clock.now()
  const completed: WorkoutLog = {
    ...workout,
    status: 'completed',
    completedAt: now.toISOString(),
  }

  await deps.workouts.save(completed)
  await advanceInstance(completed, deps)

  return buildReport(completed, await deps.exercises.all(), deps)
}

/**
 * Moves the program on by one day.
 *
 * Advancing on *completion* rather than on the calendar is deliberate.
 * LiftTracker keyed sessions to weekdays and StrengthFlow computed the
 * current day from days-elapsed since the program started, so both drifted
 * permanently out of step the first time a lifter missed a Tuesday. A
 * program here is a queue, not a calendar.
 */
async function advanceInstance(workout: WorkoutLog, deps: FinishWorkoutDeps): Promise<void> {
  const position = workout.position
  if (position === undefined) return

  const instance = await deps.instances.byId(position.instanceId)
  if (instance === undefined) return

  const result = nextPosition(instance.templateSnapshot, instance)

  switch (result.kind) {
    case 'invalid':
      return
    case 'moved':
      await deps.instances.save({ ...instance, ...result.position })
      return
    case 'finished':
      await deps.instances.save({
        ...instance,
        status: 'completed',
        completedAt: deps.clock.now().toISOString(),
      })
      return
  }
}

async function buildReport(
  workout: WorkoutLog,
  library: readonly Exercise[],
  deps: FinishWorkoutDeps,
): Promise<WorkoutReport> {
  const lookup = (id: ExerciseId): Exercise | undefined =>
    library.find((exercise) => exercise.id === id)

  const volume = loggedVolume(workout, lookup)
  const volumeByMuscle = trainedMuscles(volume).map((muscle) => ({
    muscle,
    sets: displaySets(volume[muscle]),
  }))

  const progress: ExerciseProgress[] = []
  const newEstimates: { exerciseId: ExerciseId; estimate: E1rmEstimate }[] = []

  for (const entry of workout.entries) {
    const performed = workingSets(entry)
    if (performed.length === 0) continue

    const exercise = lookup(entry.exerciseId)
    const estimate = estimateFromWorkout(workout, entry.exerciseId)
    if (estimate !== undefined) newEstimates.push({ exerciseId: entry.exerciseId, estimate })

    progress.push({
      exerciseId: entry.exerciseId,
      name: exercise?.name ?? entry.exerciseId,
      verdict: await verdictFor(workout, entry.exerciseId, deps),
      ...(estimate !== undefined ? { estimate } : {}),
    })
  }

  const durationMinutes =
    workout.completedAt === undefined
      ? 0
      : Math.max(
          0,
          Math.round(
            (new Date(workout.completedAt).getTime() - new Date(workout.startedAt).getTime()) /
              60000,
          ),
        )

  return {
    workout,
    durationMinutes,
    workingSets: totalWorkingSets(workout),
    tonnage: totalTonnage(workout),
    volumeByMuscle,
    progress,
    newEstimates,
    headline: headlineFor(progress),
  }
}

async function verdictFor(
  workout: WorkoutLog,
  exerciseId: ExerciseId,
  deps: FinishWorkoutDeps,
): Promise<ExerciseProgress['verdict']> {
  const history = await deps.workouts.forExercise(exerciseId, 5)
  const previous = history.find(
    (candidate) => candidate.id !== workout.id && candidate.status === 'completed',
  )
  if (previous === undefined) return 'new'

  const best = (log: WorkoutLog): number => {
    const sets = log.entries
      .filter((entry) => entry.exerciseId === exerciseId)
      .flatMap((entry) => workingSets(entry))

    return sets.reduce((max, set) => {
      const volume = (set.actualLoad ?? 0) * (set.actualReps ?? 0)
      return Math.max(max, volume)
    }, 0)
  }

  const current = best(workout)
  const before = best(previous)

  if (current > before) return 'better'
  if (current < before) return 'worse'
  return 'matched'
}

function headlineFor(progress: readonly ExerciseProgress[]): string {
  const regressed = progress.filter((entry) => entry.verdict === 'worse')
  const improved = progress.filter((entry) => entry.verdict === 'better')

  if (progress.length === 0) return 'Session logged.'
  if (regressed.length === 0 && improved.length > 0) {
    return `Every lift matched or beat last time, and ${String(improved.length)} improved.`
  }
  if (regressed.length === 0) return 'Every lift matched or beat last time.'

  return `${String(regressed.length)} lift${regressed.length === 1 ? '' : 's'} came in under last time: ${regressed
    .map((entry) => entry.name)
    .join(', ')}.`
}
