import type { IdGenerator } from '@/domain/ids/ids'
import type {
  CheckInRepository,
  Clock,
  ExerciseRepository,
  PositionRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { DATABASE_NAME } from '@/config/storage-keys'
import { openLiftDatabase, type LiftDatabase } from '@/infrastructure/db/database'
import {
  createCheckInRepository,
  createExerciseRepository,
  createPositionRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import {
  retireBuiltInExercises,
  RETIRED_EXERCISE_SLUGS,
  seedIfEmpty,
  syncBuiltInExercises,
} from '@/infrastructure/seed/seed'
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
 *
 * Notably short now. Bootstrap used to seed programs, additively sync
 * them, refresh the ones whose content had changed, retire the withdrawn
 * ones, re-snapshot an untrained run and auto-start the default — six
 * mechanisms whose combined job was keeping a *stored copy* of the
 * program in step with the code. The program is derived from settings
 * now, so none of them exist.
 */

export interface AppServices {
  readonly db: LiftDatabase
  readonly exercises: ExerciseRepository
  readonly position: PositionRepository
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
  readonly exercisesSeeded: number
}

export async function bootstrap(): Promise<BootstrapResult> {
  const db = await openLiftDatabase(DATABASE_NAME)

  const services: AppServices = {
    db,
    exercises: createExerciseRepository(db),
    position: createPositionRepository(db),
    workouts: createWorkoutRepository(db),
    checkIns: createCheckInRepository(db),
    ids: cryptoIds,
    clock: systemClock,
  }

  const seedDeps = {
    exercises: services.exercises,
    ids: services.ids,
    now: services.clock.now(),
  }

  const exercisesSeeded = await seedIfEmpty(seedDeps)

  // Additive, every start: an install predating an exercise would
  // otherwise never receive it.
  const added = await syncBuiltInExercises(seedDeps)

  // And the reverse — an exercise withdrawn from the catalogue stays in
  // an existing library and keeps being selected unless it is archived.
  const archived = await retireBuiltInExercises(seedDeps, RETIRED_EXERCISE_SLUGS)

  // Asks the browser to exempt this origin from eviction under disk
  // pressure. Best-effort by design: it cannot fail in a way that should
  // stop the app opening, and the real status is reported in Settings
  // rather than assumed.
  void requestPersistence().then((state) => {
    logger.info('storage.persistence', { state })
  })

  logger.info('app.bootstrap', {
    exercisesSeeded,
    exercisesAddedBySync: added,
    exercisesArchived: archived.length,
  })

  return { services, exercisesSeeded }
}
