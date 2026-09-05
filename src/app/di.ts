import type { Geolocation } from '@/domain/atlas/Geolocation'
import type { PlaceSearchProvider } from '@/domain/atlas/PlaceSearch'
import type { IdGenerator } from '@/domain/ids/ids'
import type {
  BacklogItemRepository,
  BacklogSettingsRepository,
  CheckInRepository,
  Clock,
  ExerciseRepository,
  ExploredAreaRepository,
  PlaceRepository,
  PositionRepository,
  ProjectRepository,
  ReviewRepository,
  SettingsRepository,
  SyncStateRepository,
  SyncTarget,
  TombstoneRepository,
  AttemptRepository,
  ChallengeRepository,
  RoomRepository,
  TrackGateway,
  CampaignRepository,
  FinanceRepository,
  ResumeRepository,
  TripRepository,
  ViceRepository,
  UpgradeRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import { DATABASE_NAME } from '@/config/storage-keys'
import { readFirebaseConfig } from '@/config/firebase'
import { createAccountHolder, type AccountHolder } from '@/infrastructure/firestore/account-holder'
import type { FirestoreCollectionDeps } from '@/infrastructure/firestore/collection'
import {
  createFirestoreAttempts,
  createFirestoreCampaigns,
  createFirestoreChallenges,
  createFirestoreCheckIns,
  createFirestoreExercises,
  createFirestoreFinance,
  createFirestoreItems,
  createFirestorePlaces,
  createFirestoreProjects,
  createFirestoreResume,
  createFirestoreReview,
  createFirestoreRooms,
  createFirestoreTrips,
  createFirestoreUpgrades,
  createFirestoreVices,
  createFirestoreWorkouts,
} from '@/infrastructure/firestore/repositories'
import { openDatabase, type AppDatabase } from '@/infrastructure/db/database'
import {
  createBacklogItemRepository,
  createCheckInRepository,
  createExerciseRepository,
  createExploredAreaRepository,
  createPlaceRepository,
  createPositionRepository,
  createProjectRepository,
  createReviewRepository,
  createTombstoneRepository,
  createAttemptRepository,
  createChallengeRepository,
  createRoomRepository,
  createCampaignRepository,
  createFinanceRepository,
  createResumeRepository,
  createTripRepository,
  createViceRepository,
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
import { createTrackGateway } from '@/infrastructure/mind/track-gateway'
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
  readonly review: ReviewRepository
  readonly places: PlaceRepository
  readonly finance: FinanceRepository
  readonly campaigns: CampaignRepository
  readonly attempts: AttemptRepository
  readonly challenges: ChallengeRepository
  readonly rooms: RoomRepository
  readonly tracks: TrackGateway
  /** Which local day the boards were last read on their own. */
  readonly resume: ResumeRepository
  readonly trips: TripRepository
  readonly vices: ViceRepository
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
  /**
   * Which account the record repositories read and write under, absent
   * on a build with no Firebase project.
   *
   * **Its presence is what says where the records live.** Set, they are
   * Firestore-backed and `AuthGate` must have a uid before any screen
   * renders; absent, they are the local IndexedDB ones and there is
   * nobody to sign in as.
   */
  readonly account?: AccountHolder
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

  /*
   * **Where the records live is decided once, by whether there is a
   * Firebase project.**
   *
   * With one, Firestore is the store: no exchange, no merge, no
   * tombstone, because there is only one copy. The account is not known
   * yet — sign-in resolves a moment after this runs — which is why the
   * repositories read a holder per call rather than taking a uid.
   *
   * With none, the local IndexedDB repositories, which is what a
   * development build without `.env.local` gets. That path is kept
   * deliberately: the app has to be runnable with no Google account and
   * no network, and `pnpm emulator` covers the rest.
   *
   * **Device state is local either way.** The program position is the
   * one record with no correct last-write-wins answer, and the settings
   * hold preferences two machines legitimately disagree about — neither
   * belongs in a shared store.
   *
   * The SDK is imported dynamically so it stays out of the entry chunk,
   * the same reason `useSync` does it. `bootstrap` is already async and
   * already awaited before the first render, so this costs nothing that
   * opening the database did not already cost.
   */
  const firebase = readFirebaseConfig()
  let remote: FirestoreCollectionDeps | undefined
  let account: AccountHolder | undefined

  if (firebase.kind === 'configured') {
    account = createAccountHolder()
    const { firebaseClient } = await import('@/infrastructure/sync/firebase-app')
    remote = { firestore: firebaseClient(firebase.config).db, account, clock: systemClock }
  }

  const services: AppServices = {
    db,
    exercises:
      remote === undefined
        ? createExerciseRepository(db, systemClock)
        : createFirestoreExercises(remote),
    position: createPositionRepository(db),
    workouts:
      remote === undefined
        ? createWorkoutRepository(db, systemClock)
        : createFirestoreWorkouts(remote),
    checkIns:
      remote === undefined
        ? createCheckInRepository(db, systemClock)
        : createFirestoreCheckIns(remote),
    items:
      remote === undefined
        ? createBacklogItemRepository(db, systemClock)
        : createFirestoreItems(remote),
    projects:
      remote === undefined
        ? createProjectRepository(db, systemClock)
        : createFirestoreProjects(remote),
    upgrades:
      remote === undefined
        ? createUpgradeRepository(db, systemClock)
        : createFirestoreUpgrades(remote),
    review:
      remote === undefined
        ? createReviewRepository(db, systemClock)
        : createFirestoreReview(remote),
    places:
      remote === undefined ? createPlaceRepository(db, systemClock) : createFirestorePlaces(remote),
    finance:
      remote === undefined
        ? createFinanceRepository(db, systemClock)
        : createFirestoreFinance(remote),
    campaigns:
      remote === undefined
        ? createCampaignRepository(db, systemClock)
        : createFirestoreCampaigns(remote),
    attempts:
      remote === undefined
        ? createAttemptRepository(db, systemClock)
        : createFirestoreAttempts(remote),
    challenges:
      remote === undefined
        ? createChallengeRepository(db, systemClock)
        : createFirestoreChallenges(remote),
    rooms:
      remote === undefined ? createRoomRepository(db, systemClock) : createFirestoreRooms(remote),
    tracks: createTrackGateway(),
    resume:
      remote === undefined
        ? createResumeRepository(db, systemClock)
        : createFirestoreResume(remote),
    trips:
      remote === undefined ? createTripRepository(db, systemClock) : createFirestoreTrips(remote),
    vices:
      remote === undefined ? createViceRepository(db, systemClock) : createFirestoreVices(remote),
    explored: createExploredAreaRepository(db),
    geolocation: createBrowserGeolocation(),
    placeSearch: new NominatimSearchProvider(),
    backlogSettings: createBacklogSettingsStore(),
    tombstones: createTombstoneRepository(db),
    settings: createSettingsStore(),
    syncState: createSyncStateStore(),
    syncTarget: createNullSyncTarget(),
    ...(account === undefined ? {} : { account }),
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
  /*
   * **Skipped when the store is remote, and that is a correctness fix
   * rather than an optimisation.**
   *
   * This is a *read*, and with Firestore behind the repositories there
   * is no account yet — sign-in resolves after `bootstrap` returns. It
   * threw, and because the failure happens before the first render the
   * whole app fell back to the "storage is unavailable" screen: an
   * accurate message about the wrong thing, on a device where storage
   * was perfectly fine.
   *
   * Found by driving it. Nothing depends on the number but a log line.
   */
  const exerciseCount = remote === undefined ? await services.exercises.count() : undefined

  // Asks the browser to exempt this origin from eviction under disk
  // pressure. Best-effort by design: it cannot fail in a way that should
  // stop the app opening, and the real status is reported in Settings
  // rather than assumed.
  void requestPersistence().then((state) => {
    logger.info('storage.persistence', { state })
  })

  logger.info('app.bootstrap', {
    store: remote === undefined ? 'local' : 'firestore',
    exerciseCount,
  })

  return { services, exerciseCount: exerciseCount ?? 0 }
}
