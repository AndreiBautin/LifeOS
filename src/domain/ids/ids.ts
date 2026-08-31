/**
 * Identifiers are opaque strings, branded so a WorkoutId cannot be passed
 * where an ExerciseId is expected. The brand exists only at compile time;
 * at runtime these are plain strings, which is what IndexedDB stores.
 */
declare const brand: unique symbol

type Branded<T extends string> = string & { readonly [brand]: T }

export type ExerciseId = Branded<'ExerciseId'>
export type ProgramId = Branded<'ProgramId'>
export type InstanceId = Branded<'InstanceId'>
export type WorkoutId = Branded<'WorkoutId'>
export type SlotId = Branded<'SlotId'>
export type CheckInId = Branded<'CheckInId'>
/**
 * A backlog item — a game, a book, a series.
 *
 * Named for its area rather than called `ItemId`, because "item" on its own
 * is what half the app would call whatever it is currently holding.
 */
export type BacklogItemId = Branded<'BacklogItemId'>
/**
 * A project in the quest log — not a training program. `ProgramId` above
 * is the other one, and the two are one letter apart on the screen.
 */
export type ProjectId = Branded<'ProjectId'>
export type ActionId = Branded<'ActionId'>
export type UpgradeId = Branded<'UpgradeId'>
export type MetricId = Branded<'MetricId'>
export type FriendId = Branded<'FriendId'>
export type DailyId = Branded<'DailyId'>
/**
 * Something you mean to have less of — coffee, a beer — held as a pool of
 * charges rather than as a rule. Named for the thing rather than
 * `LimitId`, because the limit is a setting on it and this is what
 * carries the record.
 */
export type ViceId = Branded<'ViceId'>
export type CampaignId = Branded<'CampaignId'>
export type StageId = Branded<'StageId'>
export type AttemptId = Branded<'AttemptId'>

/* The resume: a bullet is referable because tailoring picks bullets. */
export type BulletId = Branded<'BulletId'>
export type RoleId = Branded<'RoleId'>
export type CompanyId = Branded<'CompanyId'>

export const asBulletId = (value: string): BulletId => value as BulletId
export const asRoleId = (value: string): RoleId => value as RoleId
export const asCompanyId = (value: string): CompanyId => value as CompanyId

export const asExerciseId = (value: string): ExerciseId => value as ExerciseId
export const asProgramId = (value: string): ProgramId => value as ProgramId
export const asInstanceId = (value: string): InstanceId => value as InstanceId
export const asWorkoutId = (value: string): WorkoutId => value as WorkoutId
export const asSlotId = (value: string): SlotId => value as SlotId
export const asCheckInId = (value: string): CheckInId => value as CheckInId
export const asBacklogItemId = (value: string): BacklogItemId => value as BacklogItemId
export const asProjectId = (value: string): ProjectId => value as ProjectId
export const asActionId = (value: string): ActionId => value as ActionId
export const asUpgradeId = (value: string): UpgradeId => value as UpgradeId
export const asMetricId = (value: string): MetricId => value as MetricId
export const asFriendId = (value: string): FriendId => value as FriendId
export const asDailyId = (value: string): DailyId => value as DailyId
export const asViceId = (value: string): ViceId => value as ViceId
export const asCampaignId = (value: string): CampaignId => value as CampaignId
export const asStageId = (value: string): StageId => value as StageId
export const asAttemptId = (value: string): AttemptId => value as AttemptId

/**
 * Generating an id is a side effect, so the domain takes it as a
 * dependency rather than calling `crypto.randomUUID()` where it stands.
 * A test passes a counter and gets stable ids; production passes the real
 * generator in src/app/di.ts.
 */
export interface IdGenerator {
  next(): string
}
