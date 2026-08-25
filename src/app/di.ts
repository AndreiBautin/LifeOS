import type { IdGenerator } from '@/domain/ids/ids'
import type {
  CheckInRepository,
  Clock,
  ExerciseRepository,
  InstanceRepository,
  ProgramRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { DATABASE_NAME } from '@/config/storage-keys'
import { openLiftDatabase, type LiftDatabase } from '@/infrastructure/db/database'
import {
  createCheckInRepository,
  createExerciseRepository,
  createInstanceRepository,
  createProgramRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import {
  DEFAULT_PROGRAM_ID,
  RETIRED_BUILT_IN_PROGRAM_IDS,
  RETIRED_EXERCISE_SLUGS,
} from '@/infrastructure/seed/built-in-programs'
import {
  refreshBuiltInPrograms,
  resnapshotUntrainedInstance,
  retireBuiltInExercises,
  retireBuiltInPrograms,
  seedIfEmpty,
  startDefaultProgram,
  syncBuiltInExercises,
  syncBuiltInPrograms,
} from '@/infrastructure/seed/seed'
import {
  readDeliveredBuiltIns,
  recordDeliveredBuiltIns,
} from '@/infrastructure/storage/built-in-delivery'
import { requestPersistence } from '@/infrastructure/storage/durability'
import { logger } from '@/shared/logging/logger'

/**
 * The composition root.
 *
 * The only file allowed to name a concrete implementation. Everything
 * else takes what it needs as a parameter, which is what makes a
 * use-case testable by handing it an in-memory double instead of a
 * database — and what neither old app had, where a Razor component
 * constructed its own `DbContext` and a React component called Firestore
 * directly.
 */

export interface AppServices {
  readonly db: LiftDatabase
  readonly exercises: ExerciseRepository
  readonly programs: ProgramRepository
  readonly instances: InstanceRepository
  readonly workouts: WorkoutRepository
  readonly checkIns: CheckInRepository
  readonly ids: IdGenerator
  readonly clock: Clock
}

const systemClock: Clock = {
  now: () => new Date(),
}

const cryptoIds: IdGenerator = {
  next: () =>
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : // Older Safari and some embedded webviews lack randomUUID. The
        // fallback only needs to be unique within one device's database.
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
}

export interface BootstrapResult {
  readonly services: AppServices
  readonly seeded: { readonly exercisesAdded: number; readonly programsAdded: number }
}

export async function bootstrap(): Promise<BootstrapResult> {
  const db = await openLiftDatabase(DATABASE_NAME)

  const services: AppServices = {
    db,
    exercises: createExerciseRepository(db),
    programs: createProgramRepository(db),
    instances: createInstanceRepository(db),
    workouts: createWorkoutRepository(db),
    checkIns: createCheckInRepository(db),
    ids: cryptoIds,
    clock: systemClock,
  }

  const seeded = await seedIfEmpty({
    exercises: services.exercises,
    programs: services.programs,
    ids: services.ids,
    now: services.clock.now(),
  })

  // Asks the browser to exempt this origin from eviction under disk
  // pressure. Best-effort by design: it cannot fail in a way that should
  // stop the app opening, and the real status is reported in Settings
  // rather than assumed.
  void requestPersistence().then((state) => {
    logger.info('storage.persistence', { state })
  })

  const seedDeps = {
    exercises: services.exercises,
    programs: services.programs,
    ids: services.ids,
    now: services.clock.now(),
  }

  // Additive, every start: an install predating an exercise would
  // otherwise never receive it, and programs referencing it would quietly
  // drop the slot.
  const exercisesAdded = await syncBuiltInExercises(seedDeps)

  // The same for programs, except a missing program may have been deleted
  // on purpose — so this offers each built-in exactly once and records
  // that it did.
  const programSync = await syncBuiltInPrograms(seedDeps, readDeliveredBuiltIns())

  // And the reverse: a built-in the app has stopped shipping stays in an
  // existing lifter's library forever unless it is actively removed.
  const retired = await retireBuiltInPrograms(
    { ...seedDeps, instances: services.instances },
    RETIRED_BUILT_IN_PROGRAM_IDS,
  )

  // Retired ids are recorded as delivered too, so a lifter still running
  // one — which retirement deliberately spares — does not have it removed
  // and then handed straight back on the next start.
  recordDeliveredBuiltIns([...programSync.allIds, ...RETIRED_BUILT_IN_PROGRAM_IDS])

  // A built-in whose shipped content has changed is rewritten, and an
  // exercise withdrawn from the catalogue is archived so it stops being
  // selected. Both are additive-sync's blind spot: without them an
  // existing install keeps the block and the library it was first given.
  const refreshed = await refreshBuiltInPrograms(seedDeps)
  const archivedExercises = await retireBuiltInExercises(seedDeps, RETIRED_EXERCISE_SLUGS)

  // One program ships, so there is nothing to choose between: open the app
  // on today's session rather than on a library with one entry.
  const autoStarted = await startDefaultProgram(
    { ...seedDeps, instances: services.instances },
    DEFAULT_PROGRAM_ID,
  )

  // A run the app started for the lifter snapshots whatever template
  // existed at first launch, so a refresh would otherwise never reach it.
  // Safe only while nothing has been logged against it.
  const resnapshotted = await resnapshotUntrainedInstance({
    ...seedDeps,
    instances: services.instances,
    workouts: services.workouts,
  })

  logger.info('app.bootstrap', {
    exercisesSeeded: seeded.exercisesAdded,
    programsSeeded: seeded.programsAdded,
    exercisesAddedBySync: exercisesAdded,
    programsAddedBySync: programSync.added.length,
    programsRetired: retired.length,
    programsRefreshed: refreshed.length,
    exercisesArchived: archivedExercises.length,
    autoStarted,
    resnapshotted,
  })

  return { services, seeded }
}
