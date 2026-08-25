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
import { seedIfEmpty, syncBuiltInExercises } from '@/infrastructure/seed/seed'
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

  // Additive, every start: an install predating an exercise would
  // otherwise never receive it, and programs referencing it would quietly
  // drop the slot.
  const added = await syncBuiltInExercises({
    exercises: services.exercises,
    programs: services.programs,
    ids: services.ids,
    now: services.clock.now(),
  })

  logger.info('app.bootstrap', {
    exercisesSeeded: seeded.exercisesAdded,
    programsSeeded: seeded.programsAdded,
    exercisesAddedBySync: added,
  })

  return { services, seeded }
}
