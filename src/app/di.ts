import type { IdGenerator } from '@/domain/ids/ids'
import type {
  BacklogItemRepository,
  BacklogSettingsRepository,
  ProjectRepository,
  UpgradeRepository,
  CheckInRepository,
  Clock,
  ExerciseRepository,
  PositionRepository,
  SettingsRepository,
  SyncStateRepository,
  SyncTarget,
  TombstoneRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { DATABASE_NAME } from '@/config/storage-keys'
import { openLiftDatabase, type LiftDatabase } from '@/infrastructure/db/database'
import {
  createBacklogItemRepository,
  createProjectRepository,
  createUpgradeRepository,
  createCheckInRepository,
  createExerciseRepository,
  createPositionRepository,
  createTombstoneRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { createBacklogSettingsStore } from '@/infrastructure/storage/backlog-settings-store'
import { createSettingsStore } from '@/infrastructure/storage/settings-store'
import { createSyncStateStore } from '@/infrastructure/storage/sync-state-store'
import { createNullSyncTarget } from '@/infrastructure/sync/targets'
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
  readonly items: BacklogItemRepository
  readonly projects: ProjectRepository
  readonly upgrades: UpgradeRepository
  readonly backlogSettings: BacklogSettingsRepository
  readonly tombstones: TombstoneRepository
  readonly settings: SettingsRepository
  readonly syncState: SyncStateRepository
  /**
   * Where changes go, if anywhere.
   *
   * The null target until a backend is chosen — syncing against it is a
   * no-op, so the path is wired end to end and demonstrably does nothing
   * rather than sitting behind a branch nobody has run.
   */
  readonly syncTarget: SyncTarget
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
  /** How many exercises the library resolved to, for the startup log. */
  readonly exerciseCount: number
}

export async function bootstrap(): Promise<BootstrapResult> {
  const db = await openLiftDatabase(DATABASE_NAME)

  const services: AppServices = {
    db,
    exercises: createExerciseRepository(db, systemClock),
    position: createPositionRepository(db),
    workouts: createWorkoutRepository(db, systemClock),
    checkIns: createCheckInRepository(db, systemClock),
    items: createBacklogItemRepository(db, systemClock),
    projects: createProjectRepository(db, systemClock),
    upgrades: createUpgradeRepository(db, systemClock),
    backlogSettings: createBacklogSettingsStore(),
    tombstones: createTombstoneRepository(db),
    settings: createSettingsStore(),
    syncState: createSyncStateStore(),
    syncTarget: createNullSyncTarget(),
    ids: cryptoIds,
    clock: systemClock,
  }

  /*
   * Nothing to seed, sync or retire.
   *
   * The library used to be copied into IndexedDB on first run and then
   * kept up to date by two further passes — an additive sync for
   * exercises that shipped later, and a hand-written retirement list for
   * ones withdrawn. Three mechanisms, and none of them could deliver the
   * change most likely to happen: an edit to an exercise that already
   * existed. A device kept showing "Pull-Ups" and a 12–20 lateral raise
   * long after the catalogue said otherwise.
   *
   * The catalogue is now read at every use, so a change to it is
   * delivered by being made. See `domain/exercises/library.ts`.
   */
  const exerciseCount = await services.exercises.count()

  // Asks the browser to exempt this origin from eviction under disk
  // pressure. Best-effort by design: it cannot fail in a way that should
  // stop the app opening, and the real status is reported in Settings
  // rather than assumed.
  void requestPersistence().then((state) => {
    logger.info('storage.persistence', { state })
  })

  logger.info('app.bootstrap', { exerciseCount })

  return { services, exerciseCount }
}
