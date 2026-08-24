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

export const asExerciseId = (value: string): ExerciseId => value as ExerciseId
export const asProgramId = (value: string): ProgramId => value as ProgramId
export const asInstanceId = (value: string): InstanceId => value as InstanceId
export const asWorkoutId = (value: string): WorkoutId => value as WorkoutId
export const asSlotId = (value: string): SlotId => value as SlotId
export const asCheckInId = (value: string): CheckInId => value as CheckInId

/**
 * Generating an id is a side effect, so the domain takes it as a
 * dependency rather than calling `crypto.randomUUID()` where it stands.
 * A test passes a counter and gets stable ids; production passes the real
 * generator in src/app/di.ts.
 */
export interface IdGenerator {
  next(): string
}
