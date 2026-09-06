import type {
  AttemptRepository,
  BacklogItemRepository,
  ChallengeRepository,
  CampaignRepository,
  Clock,
  ExploredAreaRepository,
  FinanceRepository,
  PlaceRepository,
  ProjectRepository,
  ResumeRepository,
  RoomRepository,
  SettingsRepository,
  TripRepository,
  UpgradeRepository,
  ViceRepository,
  WorkoutRepository,
} from '@/domain/repositories/ports'
import type { IdGenerator } from '@/domain/ids/ids'

/**
 * What seeding needs, and nothing more.
 *
 * Narrower than `AppServices` on purpose: the seeder is handed the
 * repositories it writes to rather than the whole application, so a test
 * can supply five fakes instead of thirty, and adding a collection to the
 * app does not silently widen what the demo can reach.
 */
export interface DemoDeps {
  readonly items: BacklogItemRepository
  readonly attempts: AttemptRepository
  readonly challenges: ChallengeRepository
  readonly projects: ProjectRepository
  readonly upgrades: UpgradeRepository
  readonly rooms: RoomRepository
  readonly finance: FinanceRepository
  readonly campaigns: CampaignRepository
  readonly vices: ViceRepository
  readonly places: PlaceRepository
  /**
   * Written by nothing here — visited places light the fog on their own,
   * through `allExploredCells`. It is present because `AtlasDeps` asks
   * for it, and handing the seeder the real repository is better than a
   * stub that would quietly diverge from one.
   */
  readonly explored: ExploredAreaRepository
  readonly workouts: WorkoutRepository
  /**
   * Written once, for one field. The exploration ladder has no
   * denominator until somebody names the region they are exploring, so
   * without it the map's only measured reading is absent — correct
   * behaviour, and a demonstration of nothing.
   */
  readonly settings: SettingsRepository
  readonly resume: ResumeRepository
  readonly trips: TripRepository
  readonly clock: Clock
  readonly ids: IdGenerator
}
