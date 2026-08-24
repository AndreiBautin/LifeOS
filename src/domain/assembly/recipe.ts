import type { Equipment } from '@/domain/exercises/taxonomy'
import type {
  FiveThreeOneWeek,
  SupplementalConfig,
  TrainingMaxProgression,
} from '@/domain/framework/five-three-one'
import {
  CANONICAL_531_WEEKS,
  DEFAULT_BBB,
  DEFAULT_TM_PROGRESSION,
} from '@/domain/framework/five-three-one'
import type { ExerciseId } from '@/domain/ids/ids'
import type { ProgramSettings } from '@/domain/programs/program'
import { DEFAULT_PROGRAM_SETTINGS } from '@/domain/programs/program'
import type { MainLiftSlot } from '@/domain/splits/split'
import type { LandmarkSet } from '@/domain/volume/landmarks'
import { DEFAULT_LANDMARKS } from '@/domain/volume/landmarks'

/**
 * A recipe describes a program as a set of decisions rather than as a
 * finished tree of sets.
 *
 * The distinction matters. `assembleProgram` turns a recipe into an
 * ordinary `ProgramTemplate` with every set spelled out, and from that
 * point the template is editable like any other — nothing about it is
 * privileged or regenerated behind the lifter's back. The recipe is kept
 * alongside so the decisions can be revisited, but it is a starting
 * point, not a live binding.
 *
 * This is the shape LiftTracker's generator was reaching for and could
 * not express: there, the split, the exercise selection, the set counts
 * and the RPE ramp were four hardcoded `switch` statements, and the
 * output went straight into the database as immutable rows.
 */
export interface ProgramRecipe {
  readonly name: string
  readonly description: string
  readonly framework: FrameworkConfig
  readonly splitId: string
  readonly assistance: AssistanceConfig
  readonly cycles: CycleConfig
  readonly settings: ProgramSettings
}

export interface FrameworkConfig {
  /** Editable. Defaults to the canonical four-week 5/3/1 wave. */
  readonly weeks: readonly FiveThreeOneWeek[]
  readonly includeWarmups: boolean
  readonly supplemental: SupplementalConfig
  readonly trainingMaxProgression: TrainingMaxProgression
  /** Which exercise fills each of the four main-lift positions. */
  readonly mainLifts: Readonly<Record<MainLiftSlot, ExerciseId>>
  readonly mainRestSeconds: number
  readonly supplementalRestSeconds: number
}

export interface AssistanceConfig {
  /**
   * `rp-landmarks` fills each day up to its share of the weekly volume
   * target for every muscle the split assigns it, after subtracting what
   * the main and supplemental work already spent.
   * `none` leaves the framework work standing alone.
   */
  readonly policy: 'rp-landmarks' | 'none'
  readonly landmarks: LandmarkSet
  /** Ceiling on accessory exercises per session, so a day stays finishable. */
  readonly maxSlotsPerDay: number
  readonly minSetsPerSlot: number
  readonly maxSetsPerSlot: number
  /**
   * The RPE ramp across a mesocycle. LiftTracker computed this as
   * `9 - (3 - mesoWeek)` — week 1 at RPE 7 climbing to RPE 9, then a
   * deload — which is preserved here as three editable numbers.
   */
  readonly startRpe: number
  readonly endRpe: number
  readonly deloadRpe: number
  /** Preferred equipment, best first. Ignored when nothing matches. */
  readonly preferredEquipment: readonly Equipment[]
  readonly restSeconds: number
  /** Exercises the lifter never wants selected — an injury, a missing machine. */
  readonly excludedExercises: readonly ExerciseId[]
}

export interface CycleConfig {
  /** How many times the 5/3/1 block repeats. */
  readonly count: number | 'indefinite'
  /**
   * Appends a peaking block that tapers volume and finishes by working up
   * to a tested single, from which every training max is re-derived.
   * This is the explicit half of "working up to a new 1RM"; the AMRAP
   * sets do the continuous half every cycle.
   */
  readonly peaking?: PeakingConfig
}

export interface PeakingConfig {
  readonly enabled: boolean
  /** Top-set percentages for the run-up weeks, in order. */
  readonly rampPercents: readonly number[]
  /** Percentage of the training max the final test day opens its single at. */
  readonly testOpenerPercent: number
}

export const DEFAULT_PEAKING: PeakingConfig = {
  enabled: false,
  rampPercents: [92.5, 97.5],
  testOpenerPercent: 100,
}

export const DEFAULT_ASSISTANCE: AssistanceConfig = {
  policy: 'rp-landmarks',
  landmarks: DEFAULT_LANDMARKS,
  maxSlotsPerDay: 5,
  minSetsPerSlot: 2,
  maxSetsPerSlot: 4,
  startRpe: 7,
  endRpe: 9,
  deloadRpe: 5,
  preferredEquipment: ['cable', 'machine', 'dumbbell'],
  restSeconds: 90,
  excludedExercises: [],
}

/**
 * Builds a recipe with everything at its default, given the four lifts.
 * Every field is then editable — the point of the exercise is that none
 * of this is locked.
 */
export function defaultRecipe(
  mainLifts: Readonly<Record<MainLiftSlot, ExerciseId>>,
  overrides: Partial<ProgramRecipe> = {},
): ProgramRecipe {
  return {
    name: '5/3/1 BBB',
    description:
      'Wendler’s 5/3/1 with Boring But Big supplemental work, and assistance filled to weekly volume targets.',
    framework: {
      weeks: CANONICAL_531_WEEKS,
      includeWarmups: true,
      supplemental: DEFAULT_BBB,
      trainingMaxProgression: DEFAULT_TM_PROGRESSION,
      mainLifts,
      mainRestSeconds: 180,
      supplementalRestSeconds: 90,
    },
    splitId: 'four-day-main',
    assistance: DEFAULT_ASSISTANCE,
    cycles: { count: 'indefinite' },
    settings: DEFAULT_PROGRAM_SETTINGS,
    ...overrides,
  }
}

/** The lift a supplemental block targets when configured as `opposite`. */
export const OPPOSITE_LIFT: Record<MainLiftSlot, MainLiftSlot> = {
  squat: 'deadlift',
  deadlift: 'squat',
  bench: 'press',
  press: 'bench',
}
