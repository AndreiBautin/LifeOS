import type { Room } from '@/domain/base/declutter'
import type { TrackExercise, TrackId } from '@/domain/mind/tracks'
import type { Attempt } from '@/domain/mind/practice'
import type { ChallengeMark } from '@/domain/challenges/challenge'
import type { Campaign } from '@/domain/campaign/campaign'
import type { CheckIn } from '@/domain/autoregulation/check-in'
import type { FinanceReading } from '@/domain/finance/reading'
import type { Resume } from '@/domain/resume/resume'
import type { Item } from '@/domain/backlog/item'
import type { Project } from '@/domain/projects/project'
import type { Upgrade } from '@/domain/upgrades/upgrade'
import type { MetricDefinition, MonthlySnapshot } from '@/domain/review/metric'
import type { Place } from '@/domain/atlas/place/Place'
import type { PlaceId } from '@/domain/atlas/place/PlaceId'
import type { Trip } from '@/domain/atlas/trip/Trip'
import type { TripId } from '@/domain/atlas/trip/TripId'
import type { CellId } from '@/domain/atlas/exploration/GeoCell'
import type { BacklogSettings } from '@/domain/backlog/settings'
import type { Exercise } from '@/domain/exercises/exercise'
import type {
  BacklogItemId,
  CheckInId,
  ExerciseId,
  MetricId,
  ProjectId,
  UpgradeId,
  WorkoutId,
  ViceId,
  CampaignId,
  AttemptId,
  RoomId,
} from '@/domain/ids/ids'
import type { WorkoutLog } from '@/domain/logging/workout-log'
import type { ProgramPosition } from '@/domain/programs/position'
import type { AppSettings } from '@/domain/settings/settings'
import type { Tombstone } from '@/domain/sync/tombstone'
import type { Vice } from '@/domain/vitals/charges'

/**
 * The ports the application layer talks to.
 *
 * Every one of these is an interface the domain owns and infrastructure
 * implements, so a use-case can be tested by handing it an in-memory
 * double rather than by standing up a database. That seam is what neither
 * old app had: LiftTracker constructed an EF `DbContext` inside Razor
 * components — `new LiftTrackerContextBuilder(Configuration).Build()`
 * appears inside render loops — and StrengthFlow called Firestore
 * directly from React components, so nothing in either could be tested
 * without a live backend.
 */

export interface ExerciseRepository {
  all(): Promise<readonly Exercise[]>
  byId(id: ExerciseId): Promise<Exercise | undefined>
  save(exercise: Exercise): Promise<void>
  /**
   * Writes records exactly as given, without stamping `updatedAt`.
   *
   * The restore path. A record arriving from a backup file or another
   * device already carries the time it last changed, and `save` would
   * overwrite that with *now* — making every incoming record the newest
   * thing in the database, which is precisely the comparison a merge
   * depends on. Named separately rather than flagged, so no call site can
   * ask to save and receive a restore.
   */
  restoreMany(exercises: readonly Exercise[]): Promise<void>
  remove(id: ExerciseId): Promise<void>
  /**
   * Deletes without recording a tombstone.
   *
   * The receiving half of a sync. When another device's deletion arrives,
   * the tombstone is already known — it came in the batch — and the local
   * copy has to go with it. Routing that through `remove` would mint a
   * *second* tombstone stamped with this device's clock, which is both
   * redundant and, if the two clocks disagree, capable of overwriting the
   * original deletion with an earlier time and letting an intervening
   * edit resurrect the record.
   *
   * Named apart from `remove` so no call site can ask to delete and
   * silently skip recording that it did.
   */
  purge(id: ExerciseId): Promise<void>
  count(): Promise<number>
}

/**
 * Where the lifter is in the program.
 *
 * The only thing about a program that persists. The program itself is
 * derived from settings on demand — see  for
 * why storing it turned out to be the source of every staleness bug
 * rather than protection against one.
 */
export interface PositionRepository {
  get(): Promise<ProgramPosition | undefined>
  save(position: ProgramPosition): Promise<void>
  clear(): Promise<void>
}

export interface WorkoutQuery {
  readonly from?: string
  readonly to?: string
  readonly limit?: number
}

export interface WorkoutRepository {
  byId(id: WorkoutId): Promise<WorkoutLog | undefined>
  /** Most recent first. */
  recent(limit: number): Promise<readonly WorkoutLog[]>
  inRange(query: WorkoutQuery): Promise<readonly WorkoutLog[]>
  onDate(date: string): Promise<readonly WorkoutLog[]>
  /**
   * Every workout containing an exercise, newest first. Backs both the
   * previous-performance placeholder and the estimated-max chart, and is
   * the query that most needs an index — StrengthFlow answered it by
   * downloading and scanning the entire workout collection on every set.
   */
  forExercise(exerciseId: ExerciseId, limit?: number): Promise<readonly WorkoutLog[]>
  inProgress(): Promise<WorkoutLog | undefined>
  save(log: WorkoutLog): Promise<void>
  /**
   * Writes records exactly as given, without stamping `updatedAt`.
   *
   * The restore path. A record arriving from a backup file or another
   * device already carries the time it last changed, and `save` would
   * overwrite that with *now* — making every incoming record the newest
   * thing in the database, which is precisely the comparison a merge
   * depends on. Named separately rather than flagged, so no call site can
   * ask to save and receive a restore.
   */
  restoreMany(logs: readonly WorkoutLog[]): Promise<void>
  remove(id: WorkoutId): Promise<void>
  /**
   * Deletes without recording a tombstone.
   *
   * The receiving half of a sync. When another device's deletion arrives,
   * the tombstone is already known — it came in the batch — and the local
   * copy has to go with it. Routing that through `remove` would mint a
   * *second* tombstone stamped with this device's clock, which is both
   * redundant and, if the two clocks disagree, capable of overwriting the
   * original deletion with an earlier time and letting an intervening
   * edit resurrect the record.
   *
   * Named apart from `remove` so no call site can ask to delete and
   * silently skip recording that it did.
   */
  purge(id: WorkoutId): Promise<void>
  count(): Promise<number>
  all(): Promise<readonly WorkoutLog[]>
}

export interface CheckInRepository {
  byId(id: CheckInId): Promise<CheckIn | undefined>
  forWorkout(workoutId: WorkoutId): Promise<readonly CheckIn[]>
  recent(limit: number): Promise<readonly CheckIn[]>
  save(checkIn: CheckIn): Promise<void>
  /**
   * Writes records exactly as given, without stamping `updatedAt`.
   *
   * The restore path. A record arriving from a backup file or another
   * device already carries the time it last changed, and `save` would
   * overwrite that with *now* — making every incoming record the newest
   * thing in the database, which is precisely the comparison a merge
   * depends on. Named separately rather than flagged, so no call site can
   * ask to save and receive a restore.
   */
  restoreMany(checkIns: readonly CheckIn[]): Promise<void>
  remove(id: CheckInId): Promise<void>
  /**
   * Deletes without recording a tombstone.
   *
   * The receiving half of a sync. When another device's deletion arrives,
   * the tombstone is already known — it came in the batch — and the local
   * copy has to go with it. Routing that through `remove` would mint a
   * *second* tombstone stamped with this device's clock, which is both
   * redundant and, if the two clocks disagree, capable of overwriting the
   * original deletion with an earlier time and letting an intervening
   * edit resurrect the record.
   *
   * Named apart from `remove` so no call site can ask to delete and
   * silently skip recording that it did.
   */
  purge(id: CheckInId): Promise<void>
  all(): Promise<readonly CheckIn[]>
}

/**
 * The backlog: games, books, series — things waiting to be consumed.
 *
 * Same shape as the three above, and for the same reasons, with one
 * difference worth naming: there is no `replaceAll`. Backlogs had one, and
 * it rewrote the whole collection in a single call — which is a clobber
 * the moment two devices are involved, and is the destructive and
 * non-destructive operation sharing one name. It splits into
 * `restoreMany`, which writes records as given, and `clear`, which says
 * what it does.
 */
export interface BacklogItemRepository {
  all(): Promise<readonly Item[]>
  byId(id: BacklogItemId): Promise<Item | undefined>
  save(item: Item): Promise<void>
  /** Writes records exactly as given, without stamping `updatedAt`. */
  restoreMany(items: readonly Item[]): Promise<void>
  remove(id: BacklogItemId): Promise<void>
  /** Deletes without recording a tombstone — the receiving half of a sync. */
  purge(id: BacklogItemId): Promise<void>
  /** Empties the store. Never "restore into an empty store" behind one name. */
  clear(): Promise<void>
  count(): Promise<number>
}

/**
 * The quest log.
 *
 * Actions live inside their project, so there is no action repository —
 * closing one is a save of the project that holds it.
 */
export interface ProjectRepository {
  all(): Promise<readonly Project[]>
  byId(id: ProjectId): Promise<Project | undefined>
  save(project: Project): Promise<void>
  /**
   * Saves several as one transaction, stamping each.
   *
   * Completing a project can un-block others, and those others have to
   * land with it: a partial write leaves the graph saying a project is
   * blocked by something already finished. Distinct from `restoreMany`,
   * which deliberately does not stamp.
   */
  saveMany(projects: readonly Project[]): Promise<void>
  /** Writes records exactly as given, without stamping `updatedAt`. */
  restoreMany(projects: readonly Project[]): Promise<void>
  remove(id: ProjectId): Promise<void>
  /** Deletes without recording a tombstone — the receiving half of a sync. */
  purge(id: ProjectId): Promise<void>
  clear(): Promise<void>
  count(): Promise<number>
}

/**
 * The tech tree.
 *
 * No `saveMany`. Unlike a project, buying an upgrade changes no other
 * record — what it unblocks is *derived* from the graph on every read, so
 * nothing needs re-deriving and writing back. The whole reason the
 * projects repository needed a batch write is absent here.
 */
export interface UpgradeRepository {
  all(): Promise<readonly Upgrade[]>
  byId(id: UpgradeId): Promise<Upgrade | undefined>
  save(upgrade: Upgrade): Promise<void>
  /** Writes records exactly as given, without stamping `updatedAt`. */
  restoreMany(upgrades: readonly Upgrade[]): Promise<void>
  remove(id: UpgradeId): Promise<void>
  /** Deletes without recording a tombstone — the receiving half of a sync. */
  purge(id: UpgradeId): Promise<void>
  clear(): Promise<void>
  count(): Promise<number>
}

/**
 * The people in your circle.
 *
 * Never hard-deleted for going quiet — `remove` is for somebody entered by
 * mistake. Somebody you have simply not seen in two years stays, because
 * the active circle is a reading over `lastHangout` rather than a list
 * anyone curates.
 */
/**
 * Metrics defined by hand, and the months they were recorded in.
 *
 * Only the hand-defined ones are stored: the measured ones are derived
 * from `domain/game/registry.ts` on every read, for the same reason the
 * training program is derived — a stored copy of a declaration can only
 * ever be a stale one.
 *
 * A snapshot is keyed by its month, which is the invariant the whole
 * record turns on: one review per month, and re-entering a value fixes the
 * one already there.
 */
export interface ReviewRepository {
  metrics(): Promise<readonly MetricDefinition[]>
  saveMetric(metric: MetricDefinition): Promise<void>
  removeMetric(id: MetricId): Promise<void>
  restoreMetrics(metrics: readonly MetricDefinition[]): Promise<void>

  snapshots(): Promise<readonly MonthlySnapshot[]>
  snapshot(month: string): Promise<MonthlySnapshot | undefined>
  saveSnapshot(snapshot: MonthlySnapshot): Promise<void>
  restoreSnapshots(snapshots: readonly MonthlySnapshot[]): Promise<void>
  removeSnapshot(month: string): Promise<void>
  purgeSnapshot(month: string): Promise<void>
}

/** Places worth going to. */
export interface PlaceRepository {
  all(): Promise<readonly Place[]>
  byId(id: PlaceId): Promise<Place | undefined>
  save(place: Place): Promise<void>
  restoreMany(places: readonly Place[]): Promise<void>
  remove(id: PlaceId): Promise<void>
  purge(id: PlaceId): Promise<void>
  count(): Promise<number>
}

/**
 * The pools, with every charge ever spent on them.
 *
 * `remove` is here and buries a tombstone like everything else, but the
 * screen offers retiring instead — a deleted pool takes its record of
 * what you actually drank with it, and that record is the only reason
 * any of this is worth keeping.
 */
export interface ViceRepository {
  all(): Promise<readonly Vice[]>
  byId(id: ViceId): Promise<Vice | undefined>
  save(vice: Vice): Promise<void>
  restoreMany(vices: readonly Vice[]): Promise<void>
  remove(id: ViceId): Promise<void>
  purge(id: ViceId): Promise<void>
}

/**
 * The monthly money figures, keyed by month.
 *
 * No `byId` — the key *is* the month, and every caller either wants all
 * of them or wants to write this one.
 */
export interface FinanceRepository {
  all(): Promise<readonly FinanceReading[]>
  save(reading: FinanceReading): Promise<void>
  restoreMany(readings: readonly FinanceReading[]): Promise<void>
  remove(month: string): Promise<void>
  purge(month: string): Promise<void>
}

/**
 * The resume, of which there is exactly one.
 *
 * No `all`, because there is nothing to list — a second resume would be
 * a *version*, which is a different feature and would need to say what
 * distinguishes them. `get` returns undefined until one is written.
 */
export interface ResumeRepository {
  get(): Promise<Resume | undefined>
  save(resume: Resume): Promise<void>
}

/**
 * Reading a public ATS board.
 *
 * A port rather than a direct call, for the reason every port here
 * exists: the use-case must be testable without the internet, and the
 * one thing a job board is guaranteed to do is answer differently
 * tomorrow.
 */
/**
 * Reading a public news source.
 *
 * A port for the reason every port here is one: the parsing is pure and
 * testable against fixtures, and the fetching is the one thing that
 * cannot be. See `domain/news/story.ts`.
 */
export interface RoomRepository {
  all(): Promise<readonly Room[]>
  byId(id: RoomId): Promise<Room | undefined>
  save(room: Room): Promise<void>
  /** Writes exactly as given, without stamping. See `ExerciseRepository`. */
  restoreMany(rooms: readonly Room[]): Promise<void>
  remove(id: RoomId): Promise<void>
  /** Deletes without a tombstone -- the receiving half of a sync. */
  purge(id: RoomId): Promise<void>
}

export interface TrackGateway {
  read(track: TrackId): Promise<readonly TrackExercise[]>
}

export interface AttemptRepository {
  all(): Promise<readonly Attempt[]>
  byId(id: AttemptId): Promise<Attempt | undefined>
  save(attempt: Attempt): Promise<void>
  /** Writes exactly as given, without stamping. See `ExerciseRepository`. */
  restoreMany(attempts: readonly Attempt[]): Promise<void>
  remove(id: AttemptId): Promise<void>
  /** Deletes without a tombstone -- the receiving half of a sync. */
  purge(id: AttemptId): Promise<void>
}

/**
 * What the person has said about a seasonal challenge.
 *
 * There is no `byId` because nothing looks one up: the screen resolves
 * a whole season at a time against the shipped catalogue, and a single
 * mark means nothing without it.
 */
export interface ChallengeRepository {
  all(): Promise<readonly ChallengeMark[]>
  save(mark: ChallengeMark): Promise<void>
  /** Writes exactly as given, without stamping. See `ExerciseRepository`. */
  restoreMany(marks: readonly ChallengeMark[]): Promise<void>
  remove(id: string): Promise<void>
  /** Deletes without a tombstone -- the receiving half of a sync. */
  purge(id: string): Promise<void>
}

export interface CampaignRepository {
  all(): Promise<readonly Campaign[]>
  byId(id: CampaignId): Promise<Campaign | undefined>
  save(campaign: Campaign): Promise<void>
  /** Writes exactly as given, without stamping. See the note on `ExerciseRepository`. */
  restoreMany(campaigns: readonly Campaign[]): Promise<void>
  remove(id: CampaignId): Promise<void>
  /** Deletes without a tombstone -- the receiving half of a sync. */
  purge(id: CampaignId): Promise<void>
}

export interface TripRepository {
  all(): Promise<readonly Trip[]>
  byId(id: TripId): Promise<Trip | undefined>
  save(trip: Trip): Promise<void>
  restoreMany(trips: readonly Trip[]): Promise<void>
  remove(id: TripId): Promise<void>
  purge(id: TripId): Promise<void>
}

/**
 * Ground you have walked.
 *
 * The only repository here with no `remove` and no `purge`, and the
 * absence is the design: a revealed cell is a fact about where you have
 * physically been, so there is no deletion to model. `reveal` adds and
 * nothing takes away.
 *
 * `clear` exists for the wipe-and-restore import path alone, which is
 * gated behind a typed confirmation — the same reason the backlog has one.
 */
export interface ExploredAreaRepository {
  all(): Promise<ReadonlySet<CellId>>
  /** Adds cells, ignoring any already known. Returns how many were new. */
  reveal(cells: readonly CellId[]): Promise<number>
  clear(): Promise<void>
  count(): Promise<number>
}

/**
 * The backlog's own preferences.
 *
 * Separate from `SettingsRepository` because they are separate records:
 * one holds muscle tiers and estimated maxes, the other holds which
 * category a new book lands in. Merging them would put a training decision
 * and a list's default sort order in the same blob.
 */
export interface BacklogSettingsRepository {
  get(): Promise<BacklogSettings>
  save(settings: BacklogSettings): Promise<void>
}

/**
 * What has been deleted, and when.
 *
 * Append-only. Nothing removes a tombstone, because the question
 * "has every device seen this yet" has no answer here — see
 * `domain/sync/tombstone.ts` for why they are cheap enough to keep.
 */
export interface TombstoneRepository {
  all(): Promise<readonly Tombstone[]>
  /** Deletions strictly after this timestamp, for an incremental pull. */
  since(deletedAt: string): Promise<readonly Tombstone[]>
  /**
   * Records tombstones that came from elsewhere — a backup file, or
   * another device. Deleting locally goes through the owning
   * repository's `remove`, which writes its own.
   */
  record(tombstones: readonly Tombstone[]): Promise<void>
}

/**
 * The lifter's settings.
 *
 * A port because the sync needs to read and write them and lives in the
 * application layer, which may not know they are a JSON blob in
 * localStorage. Asynchronous even though the implementation is not, so
 * the seam survives a future where they are somewhere slower.
 */
export interface SettingsRepository {
  get(): Promise<AppSettings>
  save(settings: AppSettings): Promise<void>
}

/** A clock, injected so progression and scheduling are reproducible in a test. */
export interface Clock {
  now(): Date
}
