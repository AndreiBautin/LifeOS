import type { Geolocation } from '@/domain/atlas/Geolocation'
import { createAtsGateway } from '@/infrastructure/jobs/ats-gateway'
import type { PlaceSearchProvider } from '@/domain/atlas/PlaceSearch'
import type { IdGenerator } from '@/domain/ids/ids'
import type {
  BacklogItemRepository,
  BacklogSettingsRepository,
  CheckInRepository,
  Clock,
  DailyRepository,
  ExerciseRepository,
  ExploredAreaRepository,
  FriendRepository,
  PlaceRepository,
  PositionRepository,
  ProjectRepository,
  ReviewRepository,
  SettingsRepository,
  SyncStateRepository,
  SyncTarget,
  TombstoneRepository,
  FinanceRepository,
  JobBoardGateway,
  NewsGateway,
  ResumeRepository,
  TripRepository,
  ViceRepository,
  WeighInRepository,
  UpgradeRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { DATABASE_NAME } from '@/config/storage-keys'
import { openDatabase, type AppDatabase } from '@/infrastructure/db/database'
import {
  createBacklogItemRepository,
  createCheckInRepository,
  createDailyRepository,
  createExerciseRepository,
  createExploredAreaRepository,
  createFriendRepository,
  createPlaceRepository,
  createPositionRepository,
  createProjectRepository,
  createReviewRepository,
  createTombstoneRepository,
  createFinanceRepository,
  createResumeRepository,
  createTripRepository,
  createViceRepository,
  createWeighInRepository,
  createUpgradeRepository,
  createWorkoutRepository,
} from '@/infrastructure/db/repositories'
import { createBacklogSettingsStore } from '@/infrastructure/storage/backlog-settings-store'
import { createSettingsStore } from '@/infrastructure/storage/settings-store'
import { createBrowserGeolocation } from '@/infrastructure/map/browser-geolocation'
import { NominatimSearchProvider } from '@/infrastructure/map/nominatim-search'
import { createSyncStateStore } from '@/infrastructure/storage/sync-state-store'
import { createNullSyncTarget } from '@/infrastructure/sync/targets'
import { requestPersistence } from '@/infrastructure/storage/durability'
import { createDailyRunStore } from '@/infrastructure/storage/daily-run-store'
import { createNewsGateway } from '@/infrastructure/news/news-gateway'
import type { DailyRunStore } from '@/application/use-cases/daily/once-a-day'
import type { LeadSweep } from '@/application/use-cases/jobs/leads'
import type { Digest } from '@/application/use-cases/news/digest'
import { STORAGE_KEYS } from '@/config/storage-keys'
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
  readonly db: AppDatabase
  readonly exercises: ExerciseRepository
  readonly position: PositionRepository
  readonly workouts: WorkoutRepository
  readonly checkIns: CheckInRepository
  readonly items: BacklogItemRepository
  readonly projects: ProjectRepository
  readonly upgrades: UpgradeRepository
  readonly friends: FriendRepository
  readonly review: ReviewRepository
  readonly places: PlaceRepository
  readonly finance: FinanceRepository
  readonly boards: JobBoardGateway
  /** Which local day the boards were last read on their own. */
  readonly sweepStore: DailyRunStore<LeadSweep>
  readonly digestStore: DailyRunStore<Digest>
  readonly news: NewsGateway
  readonly resume: ResumeRepository
  readonly trips: TripRepository
  readonly dailies: DailyRepository
  readonly vices: ViceRepository
  readonly weighIns: WeighInRepository
  readonly explored: ExploredAreaRepository
  /** The device's own position, behind a port so a test can fake it. */
  readonly geolocation: Geolocation
  /**
   * Turning a typed name into a point, which is the one thing the atlas
   * cannot work out locally. Nominatim, the same organisation whose tiles
   * the map already draws.
   */
  readonly placeSearch: PlaceSearchProvider
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
  const db = await openDatabase(DATABASE_NAME)

  const services: AppServices = {
    db,
    exercises: createExerciseRepository(db, systemClock),
    position: createPositionRepository(db),
    workouts: createWorkoutRepository(db, systemClock),
    checkIns: createCheckInRepository(db, systemClock),
    items: createBacklogItemRepository(db, systemClock),
    projects: createProjectRepository(db, systemClock),
    upgrades: createUpgradeRepository(db, systemClock),
    friends: createFriendRepository(db, systemClock),
    review: createReviewRepository(db, systemClock),
    places: createPlaceRepository(db, systemClock),
    finance: createFinanceRepository(db, systemClock),
    boards: createAtsGateway(),
    sweepStore: createDailyRunStore(STORAGE_KEYS.jobSweptOn),
    digestStore: createDailyRunStore(STORAGE_KEYS.digestReadOn),
    news: createNewsGateway(),
    resume: createResumeRepository(db, systemClock),
    trips: createTripRepository(db, systemClock),
    dailies: createDailyRepository(db, systemClock),
    vices: createViceRepository(db, systemClock),
    weighIns: createWeighInRepository(db, systemClock),
    explored: createExploredAreaRepository(db),
    geolocation: createBrowserGeolocation(),
    placeSearch: new NominatimSearchProvider(),
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
