import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { ProgramPosition } from '@/domain/programs/position'
import type { Exercise } from '@/domain/exercises/exercise'
import type { CheckInId, ExerciseId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type {
  CheckInRepository,
  ExerciseRepository,
  PositionRepository,
  WorkoutQuery,
  WorkoutRepository,
} from '@/domain/repositories/ports'

import { fromStored, toStored, type LiftDatabase } from './database'

/**
 * IndexedDB implementations of the domain's repository ports.
 *
 * Thin by design: each method is one store or index operation. Anything
 * that needs a decision made about it belongs in a use-case, not here —
 * a repository that starts computing is a repository that cannot be
 * swapped for an in-memory double in a test.
 */

export function createExerciseRepository(db: LiftDatabase): ExerciseRepository {
  return {
    async all() {
      return db.getAll('exercises')
    },
    async byId(id: ExerciseId) {
      return db.get('exercises', id)
    },
    async save(exercise: Exercise) {
      await db.put('exercises', exercise)
    },
    async saveMany(exercises: readonly Exercise[]) {
      const tx = db.transaction('exercises', 'readwrite')
      await Promise.all([...exercises.map((exercise) => tx.store.put(exercise)), tx.done])
    },
    async remove(id: ExerciseId) {
      await db.delete('exercises', id)
    },
    async count() {
      return db.count('exercises')
    },
  }
}

/**
 * Where the lifter is, under one fixed key.
 *
 * A single-record store rather than a keyed collection, because there is
 * exactly one position and never a list of them. Modelling it as a
 * collection is what invited a library in the first place.
 */
const POSITION_KEY = 'current'

export function createPositionRepository(db: LiftDatabase): PositionRepository {
  return {
    async get() {
      return db.get('position', POSITION_KEY)
    },
    async save(position: ProgramPosition) {
      await db.put('position', position, POSITION_KEY)
    },
    async clear() {
      await db.delete('position', POSITION_KEY)
    },
  }
}

export function createWorkoutRepository(db: LiftDatabase): WorkoutRepository {
  const newestFirst = (a: WorkoutLog, b: WorkoutLog): number => b.date.localeCompare(a.date)

  return {
    async byId(id: WorkoutId) {
      const stored = await db.get('workouts', id)
      return stored === undefined ? undefined : fromStored(stored)
    },

    async recent(limit: number) {
      // Walks the date index backwards and stops at `limit`, rather than
      // loading every workout and slicing. The difference does not matter
      // at fifty workouts and matters a great deal at five thousand.
      const results: WorkoutLog[] = []
      let cursor = await db.transaction('workouts').store.index('by-date').openCursor(null, 'prev')

      while (cursor !== null && results.length < limit) {
        results.push(fromStored(cursor.value))
        cursor = await cursor.continue()
      }

      return results
    },

    async inRange(query: WorkoutQuery) {
      const range =
        query.from !== undefined && query.to !== undefined
          ? IDBKeyRange.bound(query.from, query.to)
          : query.from !== undefined
            ? IDBKeyRange.lowerBound(query.from)
            : query.to !== undefined
              ? IDBKeyRange.upperBound(query.to)
              : null

      const all = (await db.getAllFromIndex('workouts', 'by-date', range)).map(fromStored)
      const ordered = all.sort(newestFirst)
      return query.limit === undefined ? ordered : ordered.slice(0, query.limit)
    },

    async onDate(date: string) {
      return (await db.getAllFromIndex('workouts', 'by-date', date)).map(fromStored)
    },

    async forExercise(exerciseId: ExerciseId, limit?: number) {
      const matches = (await db.getAllFromIndex('workouts', 'by-exercise', exerciseId)).map(
        fromStored,
      )
      const ordered = matches.sort(newestFirst)
      return limit === undefined ? ordered : ordered.slice(0, limit)
    },

    async inProgress() {
      const open = await db.getAllFromIndex('workouts', 'by-status', 'in-progress')
      const newest = open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
      return newest === undefined ? undefined : fromStored(newest)
    },

    async save(log: WorkoutLog) {
      // The index field is derived here and nowhere else, so it cannot
      // drift from the entries it summarises.
      await db.put('workouts', toStored(log))
    },

    async remove(id: WorkoutId) {
      await db.delete('workouts', id)
    },

    async count() {
      return db.count('workouts')
    },

    async all() {
      return (await db.getAll('workouts')).map(fromStored)
    },
  }
}

export function createCheckInRepository(db: LiftDatabase): CheckInRepository {
  return {
    async byId(id: CheckInId) {
      return db.get('checkIns', id)
    },
    async forWorkout(workoutId: WorkoutId) {
      return db.getAllFromIndex('checkIns', 'by-workout', workoutId)
    },
    async recent(limit: number) {
      const results: CheckIn[] = []
      let cursor = await db
        .transaction('checkIns')
        .store.index('by-recorded')
        .openCursor(null, 'prev')

      while (cursor !== null && results.length < limit) {
        results.push(cursor.value)
        cursor = await cursor.continue()
      }

      return results
    },
    async save(checkIn: CheckIn) {
      await db.put('checkIns', checkIn)
    },
    async remove(id: CheckInId) {
      await db.delete('checkIns', id)
    },
    async all() {
      return db.getAll('checkIns')
    },
  }
}
