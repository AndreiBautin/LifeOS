import type { Item } from '@/domain/backlog/item'
import type { Room } from '@/domain/base/declutter'
import type { Campaign } from '@/domain/campaign/campaign'
import type { ChallengeMark } from '@/domain/challenges/challenge'
import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { FinanceReading } from '@/domain/finance/reading'
import type { Attempt } from '@/domain/mind/practice'
import type { Place } from '@/domain/atlas/place/Place'
import type { Project } from '@/domain/projects/project'
import type { Resume } from '@/domain/resume/resume'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { Vice } from '@/domain/vitals/charges'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  AttemptRepository,
  BacklogItemRepository,
  CampaignRepository,
  ChallengeRepository,
  CheckInRepository,
  ExerciseRepository,
  FinanceRepository,
  PlaceRepository,
  ProjectRepository,
  ResumeRepository,
  ReviewRepository,
  RoomRepository,
  TripRepository,
  UpgradeRepository,
  ViceRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'

import { createFirestoreCollection, type FirestoreCollectionDeps } from './collection'

/**
 * The record repositories, backed by Firestore instead of IndexedDB.
 *
 * **Every query here is a filter over the collection**, not a Firestore
 * index. That is deliberate at this size: one person's training history
 * is thousands of documents, the SDK serves them from its local cache
 * once a listener is attached, and a composite index is a second place
 * to keep a schema in step. If a collection ever grows past what a
 * device wants in memory, the fix is a `where` clause here and an index
 * beside it — not a change to any caller.
 *
 * **Nothing writes a tombstone.** With one authoritative copy a delete
 * is a delete, which is why `remove` and `purge` are the same operation
 * now: `purge` existed to skip the tombstone that `remove` wrote.
 */

const byNewest = <T extends { readonly updatedAt?: string }>(records: readonly T[]): readonly T[] =>
  [...records].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))

export function createFirestoreExercises(deps: FirestoreCollectionDeps): ExerciseRepository {
  const store = createFirestoreCollection<Exercise>(deps, 'exercises')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (exercise) => store.save(exercise),
    restoreMany: (exercises) => store.restoreMany(exercises),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
    count: () => store.count(),
  }
}

export function createFirestoreWorkouts(deps: FirestoreCollectionDeps): WorkoutRepository {
  const store = createFirestoreCollection<WorkoutLog>(deps, 'workouts')

  /** Newest first, which is what every caller here wants. */
  const byDate = async (): Promise<readonly WorkoutLog[]> =>
    [...(await store.all())].sort((a, b) => b.date.localeCompare(a.date))

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    recent: async (limit) => (await byDate()).slice(0, limit),
    /*
     * Both ends are optional, so an absent one means "no bound" rather
     * than a comparison against `undefined` — which is always false and
     * would quietly return nothing.
     */
    inRange: async (query) => {
      const matching = (await byDate()).filter(
        (log) =>
          (query.from === undefined || log.date >= query.from) &&
          (query.to === undefined || log.date <= query.to),
      )

      return query.limit === undefined ? matching : matching.slice(0, query.limit)
    },
    onDate: async (date) => (await store.all()).filter((log) => log.date === date),
    forExercise: async (exerciseId, limit) => {
      const matching = (await byDate()).filter((log) =>
        log.entries.some(
          (entry: { readonly exerciseId: string }) => entry.exerciseId === exerciseId,
        ),
      )

      return limit === undefined ? matching : matching.slice(0, limit)
    },
    /*
     * Open means started and not finished. There
     * is at most one — `startWorkout` refuses a second — so the first
     * match is the answer rather than an arbitrary pick.
     */
    inProgress: async () => (await store.all()).find((log) => log.status === 'in-progress'),
    save: (log) => store.save(log),
    restoreMany: (logs) => store.restoreMany(logs),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
    count: () => store.count(),
  }
}

export function createFirestoreCheckIns(deps: FirestoreCollectionDeps): CheckInRepository {
  const store = createFirestoreCollection<CheckIn>(deps, 'checkIns')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    forWorkout: async (workoutId) =>
      (await store.all()).filter((one) => one.workoutId === workoutId),
    recent: async (limit) => byNewest(await store.all()).slice(0, limit),
    save: (checkIn) => store.save(checkIn),
    restoreMany: (checkIns) => store.restoreMany(checkIns),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

export function createFirestoreItems(deps: FirestoreCollectionDeps): BacklogItemRepository {
  const store = createFirestoreCollection<Item>(deps, 'items')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (item) => store.save(item),
    restoreMany: (items) => store.restoreMany(items),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
    clear: () => store.clear(),
    count: () => store.count(),
  }
}

export function createFirestoreProjects(deps: FirestoreCollectionDeps): ProjectRepository {
  const store = createFirestoreCollection<Project>(deps, 'projects')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (project) => store.save(project),
    saveMany: (projects) => store.saveMany(projects),
    restoreMany: (projects) => store.restoreMany(projects),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
    clear: () => store.clear(),
    count: () => store.count(),
  }
}

export function createFirestoreUpgrades(deps: FirestoreCollectionDeps): UpgradeRepository {
  const store = createFirestoreCollection<Upgrade>(deps, 'upgrades')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (upgrade) => store.save(upgrade),
    restoreMany: (upgrades) => store.restoreMany(upgrades),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
    clear: () => store.clear(),
    count: () => store.count(),
  }
}

/**
 * Two collections behind one port.
 *
 * A metric is a definition and a snapshot is a month of readings; they
 * are separate stores in IndexedDB and separate collections here, and
 * the port has always presented them together because the review screen
 * needs both at once.
 *
 * **Snapshots are keyed by their month**, which is the case `idOf`
 * exists for: keyed by `id` they would every one land under `undefined`
 * and collapse to a single document.
 */
export function createFirestoreReview(deps: FirestoreCollectionDeps): ReviewRepository {
  const metrics = createFirestoreCollection<MetricDefinition>(deps, 'metrics')
  const snapshots = createFirestoreCollection<MonthlySnapshot>(
    deps,
    'reviews',
    (snapshot) => snapshot.month,
  )

  return {
    metrics: () => metrics.all(),
    saveMetric: (metric) => metrics.save(metric),
    removeMetric: (id) => metrics.remove(id),
    restoreMetrics: (rows) => metrics.restoreMany(rows),
    snapshots: () => snapshots.all(),
    snapshot: (month) => snapshots.byId(month),
    saveSnapshot: (snapshot) => snapshots.save(snapshot),
    restoreSnapshots: (rows) => snapshots.restoreMany(rows),
    removeSnapshot: (month) => snapshots.remove(month),
    purgeSnapshot: (month) => snapshots.remove(month),
  }
}

export function createFirestorePlaces(deps: FirestoreCollectionDeps): PlaceRepository {
  const store = createFirestoreCollection<Place>(deps, 'places')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (place) => store.save(place),
    restoreMany: (places) => store.restoreMany(places),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
    count: () => store.count(),
  }
}

export function createFirestoreTrips(deps: FirestoreCollectionDeps): TripRepository {
  const store = createFirestoreCollection<Trip>(deps, 'trips')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (trip) => store.save(trip),
    restoreMany: (trips) => store.restoreMany(trips),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

export function createFirestoreVices(deps: FirestoreCollectionDeps): ViceRepository {
  const store = createFirestoreCollection<Vice>(deps, 'vices')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (vice) => store.save(vice),
    restoreMany: (vices) => store.restoreMany(vices),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

/** Keyed by month, like the review snapshots and for the same reason. */
export function createFirestoreFinance(deps: FirestoreCollectionDeps): FinanceRepository {
  const store = createFirestoreCollection<FinanceReading>(deps, 'finance', (row) => row.month)

  return {
    all: () => store.all(),
    save: (reading) => store.save(reading),
    restoreMany: (rows) => store.restoreMany(rows),
    remove: (month) => store.remove(month),
    purge: (month) => store.remove(month),
  }
}

export function createFirestoreRooms(deps: FirestoreCollectionDeps): RoomRepository {
  const store = createFirestoreCollection<Room>(deps, 'rooms')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (room) => store.save(room),
    restoreMany: (rooms) => store.restoreMany(rooms),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

export function createFirestoreAttempts(deps: FirestoreCollectionDeps): AttemptRepository {
  const store = createFirestoreCollection<Attempt>(deps, 'attempts')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (attempt) => store.save(attempt),
    restoreMany: (attempts) => store.restoreMany(attempts),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

export function createFirestoreChallenges(deps: FirestoreCollectionDeps): ChallengeRepository {
  const store = createFirestoreCollection<ChallengeMark>(deps, 'challenges')

  return {
    all: () => store.all(),
    save: (challenge) => store.save(challenge),
    restoreMany: (rows) => store.restoreMany(rows),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

export function createFirestoreCampaigns(deps: FirestoreCollectionDeps): CampaignRepository {
  const store = createFirestoreCollection<Campaign>(deps, 'campaigns')

  return {
    all: () => store.all(),
    byId: (id) => store.byId(id),
    save: (campaign) => store.save(campaign),
    restoreMany: (rows) => store.restoreMany(rows),
    remove: (id) => store.remove(id),
    purge: (id) => store.remove(id),
  }
}

/**
 * One document, not a collection.
 *
 * The resume is a singleton — there is one of you — so it lives under a
 * fixed id rather than being a collection of one. It is also the record
 * this app can least afford to lose: everything else is a by-product of
 * using the app, and this was typed in off a PDF.
 */
export const RESUME_ID = 'resume'

export function createFirestoreResume(deps: FirestoreCollectionDeps): ResumeRepository {
  const store = createFirestoreCollection<Resume>(deps, 'resume', () => RESUME_ID)

  return {
    get: () => store.byId(RESUME_ID),
    save: (resume) => store.save(resume),
  }
}
