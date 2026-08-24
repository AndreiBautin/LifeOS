import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { Exercise } from '@/domain/exercises/exercise'
import type { CheckInId, ExerciseId, InstanceId, ProgramId, WorkoutId } from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramTemplate } from '@/domain/programs/program'
import type {
  CheckInRepository,
  ExerciseRepository,
  InstanceRepository,
  ProgramInstance,
  ProgramRepository,
  WorkoutQuery,
  WorkoutRepository,
} from '@/domain/repositories/ports'

import type { LiftDatabase } from './database'

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

export function createProgramRepository(db: LiftDatabase): ProgramRepository {
  return {
    async all() {
      const programs = await db.getAll('programs')
      return programs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async byId(id: ProgramId) {
      return db.get('programs', id)
    },
    async save(program: ProgramTemplate) {
      await db.put('programs', program)
    },
    async remove(id: ProgramId) {
      await db.delete('programs', id)
    },
    async count() {
      return db.count('programs')
    },
  }
}

export function createInstanceRepository(db: LiftDatabase): InstanceRepository {
  return {
    async all() {
      return db.getAll('instances')
    },
    async byId(id: InstanceId) {
      return db.get('instances', id)
    },
    async active() {
      const active = await db.getAllFromIndex('instances', 'by-status', 'active')
      // More than one active instance is not a state the app creates, but
      // an imported backup could carry one. The most recently started
      // wins rather than an arbitrary index order.
      return active.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    },
    async save(instance: ProgramInstance) {
      await db.put('instances', instance)
    },
    async remove(id: InstanceId) {
      await db.delete('instances', id)
    },
  }
}

export function createWorkoutRepository(db: LiftDatabase): WorkoutRepository {
  return {
    async byId(id: WorkoutId) {
      return db.get('workouts', id)
    },

    async recent(limit: number) {
      // Walks the date index backwards and stops at `limit`, rather than
      // loading every workout and slicing. The difference does not matter
      // at fifty workouts and matters a great deal at five thousand.
      const results: WorkoutLog[] = []
      let cursor = await db.transaction('workouts').store.index('by-date').openCursor(null, 'prev')

      while (cursor !== null && results.length < limit) {
        results.push(cursor.value)
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

      const all = await db.getAllFromIndex('workouts', 'by-date', range)
      const filtered =
        query.instanceId === undefined
          ? all
          : all.filter((workout) => workout.position?.instanceId === query.instanceId)

      const ordered = filtered.sort((a, b) => b.date.localeCompare(a.date))
      return query.limit === undefined ? ordered : ordered.slice(0, query.limit)
    },

    async onDate(date: string) {
      return db.getAllFromIndex('workouts', 'by-date', date)
    },

    async forExercise(exerciseId: ExerciseId, limit?: number) {
      const matches = await db.getAllFromIndex('workouts', 'by-exercise', exerciseId)
      const ordered = matches.sort((a, b) => b.date.localeCompare(a.date))
      return limit === undefined ? ordered : ordered.slice(0, limit)
    },

    async inProgress() {
      const open = await db.getAllFromIndex('workouts', 'by-status', 'in-progress')
      return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    },

    async save(log: WorkoutLog) {
      await db.put('workouts', log)
    },

    async remove(id: WorkoutId) {
      await db.delete('workouts', id)
    },

    async count() {
      return db.count('workouts')
    },

    async all() {
      return db.getAll('workouts')
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
