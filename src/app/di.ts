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
import { DATABASE_NAME, IS_DEMO } from '@/config/storage-keys'
import { seedDemoData } from '@/application/use-cases/demo/seed'
import { readFirebaseConfig } from '@/config/firebase'
import { createAccountHolder, type AccountHolder } from '@/infrastructure/firestore/account-holder'
import type { FirestoreCollectionDeps } from '@/infrastructure/firestore/collection'
/*
 * **Type-only, deliberately.** Importing the factories here for real is
 * what put the Firebase SDK in the entry chunk — see `remoteFactories`
 * below.
 */
import type * as FirestoreRepositories from '@/infrastructure/firestore/repositories'
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
  let firestore: typeof FirestoreRepositories | undefined

  if (firebase.kind === 'configured') {
    account = createAccountHolder()
    /*
     * **Both of these, and the second one is the whole point.** Importing
     * `firebase-app` on demand looked like it kept the SDK out of the
     * entry chunk, and the comment above said so — but the repository
     * factories were imported statically three lines further up, and they
     * pull in `firebase/firestore`. One static import defeated every
     * dynamic one in the app.
     *
     * The entry chunk is the same size either way — the SDK was always
     * its own chunk. What changed is whether that chunk is *fetched*:
     * a static import made the browser download 535 kB on first paint,
     * where a dynamic one leaves it listed as a lazy dependency and
     * never asked for on a build with no project configured.
     *
     * It also closes an offline hole. `globIgnores` in `vite.config.ts`
     * deliberately keeps the SDK out of the precache, on the reasoning
     * that sync needs a network anyway — which was only safe if nothing
     * precached depended on it statically. It did.
     */
    const [{ firebaseClient }, repositories] = await Promise.all([
      import('@/infrastructure/sync/firebase-app'),
      import('@/infrastructure/firestore/repositories'),
    ])
    firestore = repositories
    remote = { firestore: firebaseClient(firebase.config).db, account, clock: systemClock }
  }

  /*
   * Narrowing `remote` no longer narrows `firestore`, because they are two
   * variables assigned in one branch. This asserts the pairing once rather
   * than at twenty call sites — and it cannot lie: both are set together
   * or neither is.
   */
  const firestoreRepos = (): typeof FirestoreRepositories => {
    if (firestore === undefined) {
      throw new Error('The Firestore repositories were asked for without a configured project.')
    }
    return firestore
  }

  const services: AppServices = {
    db,
    exercises:
      remote === undefined
        ? createExerciseRepository(db, systemClock)
        : firestoreRepos().createFirestoreExercises(remote),
    position: createPositionRepository(db),
    workouts:
      remote === undefined
        ? createWorkoutRepository(db, systemClock)
        : firestoreRepos().createFirestoreWorkouts(remote),
    checkIns:
      remote === undefined
        ? createCheckInRepository(db, systemClock)
        : firestoreRepos().createFirestoreCheckIns(remote),
    items:
      remote === undefined
        ? createBacklogItemRepository(db, systemClock)
        : firestoreRepos().createFirestoreItems(remote),
    projects:
      remote === undefined
        ? createProjectRepository(db, systemClock)
        : firestoreRepos().createFirestoreProjects(remote),
    upgrades:
      remote === undefined
        ? createUpgradeRepository(db, systemClock)
        : firestoreRepos().createFirestoreUpgrades(remote),
    review:
      remote === undefined
        ? createReviewRepository(db, systemClock)
        : firestoreRepos().createFirestoreReview(remote),
    places:
      remote === undefined
        ? createPlaceRepository(db, systemClock)
        : firestoreRepos().createFirestorePlaces(remote),
    finance:
      remote === undefined
        ? createFinanceRepository(db, systemClock)
        : firestoreRepos().createFirestoreFinance(remote),
    campaigns:
      remote === undefined
        ? createCampaignRepository(db, systemClock)
        : firestoreRepos().createFirestoreCampaigns(remote),
    attempts:
      remote === undefined
        ? createAttemptRepository(db, systemClock)
        : firestoreRepos().createFirestoreAttempts(remote),
    challenges:
      remote === undefined
        ? createChallengeRepository(db, systemClock)
        : firestoreRepos().createFirestoreChallenges(remote),
    rooms:
      remote === undefined
        ? createRoomRepository(db, systemClock)
        : firestoreRepos().createFirestoreRooms(remote),
    tracks: createTrackGateway(),
    resume:
      remote === undefined
        ? createResumeRepository(db, systemClock)
        : firestoreRepos().createFirestoreResume(remote),
    trips:
      remote === undefined
        ? createTripRepository(db, systemClock)
        : firestoreRepos().createFirestoreTrips(remote),
    vices:
      remote === undefined
        ? createViceRepository(db, systemClock)
        : firestoreRepos().createFirestoreVices(remote),
    explored: createExploredAreaRepository(db),
    geolocation: createBrowserGeolocation(),
    placeSearch: new NominatimSearchProvider(),
    backlogSettings: createBacklogSettingsStore(),
    tombstones: createTombstoneRepository(db),
    settings: createSettingsStore(),
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
  /*
   * **A demo build fills itself the first time it is opened.**
   *
   * Only when empty — `seedDemoData` refuses otherwise — so a visitor
   * who has since added something of their own keeps it. It runs before
   * the first render for the same reason the database is opened here:
   * no screen should have to handle "the app is not ready yet".
   */
  if (IS_DEMO) {
    const seeded = await seedDemoData(services)
    logger.info('demo.seed', { seeded: seeded.seeded, reason: seeded.reason ?? 'none' })
  }

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
