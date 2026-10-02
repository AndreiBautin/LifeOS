import type { Clock, SettingsRepository, WorkoutRepository } from '@/domain/repositories/ports'
import type { IdGenerator } from '@/domain/ids/ids'

/** What the demo seed writes through: a training history and one setting. */
export interface DemoDeps {
  readonly workouts: WorkoutRepository
  readonly settings: SettingsRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}
