/**
 * The exercise taxonomy.
 *
 * Carried over from LiftTracker, where exercises were selected by
 * `MuscleGroup × EquipmentType × IsCompound × IsCompetition` rather than
 * by name. That indirection is what makes automatic substitution possible:
 * "swap this exercise" means "find another row with the same shape",
 * which works for an exercise the app has never seen.
 *
 * Two changes from the original. LiftTracker collapsed hamstrings and
 * glutes into `PosteriorChain` and lumped all three deltoid heads into
 * `Delts`; ProgramBuilder had split the delts but not the posterior
 * chain. Both are split here, because weekly volume landmarks are
 * per-head and per-muscle — rear delts and front delts do not share a
 * recovery budget, and neither do hamstrings and glutes.
 *
 * LiftTracker also distinguished machines by manufacturer
 * (`MachineNautilus`, `MachineHammerStrength`). That is a property of one
 * particular gym, not of the movement, so it is dropped; a machine is a
 * machine, and the exercise's name carries the rest.
 */

export const MUSCLE_GROUPS = [
  'chest',
  'front-delts',
  'side-delts',
  'rear-delts',
  'triceps',
  'lats',
  'upper-back',
  'biceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
] as const

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  'front-delts': 'Front delts',
  'side-delts': 'Side delts',
  'rear-delts': 'Rear delts',
  triceps: 'Triceps',
  lats: 'Lats',
  'upper-back': 'Upper back',
  biceps: 'Biceps',
  forearms: 'Forearms',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
}

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'ez-bar',
  'other',
] as const

export type Equipment = (typeof EQUIPMENT)[number]

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  smith: 'Smith machine',
  'ez-bar': 'EZ bar',
  other: 'Other',
}

/**
 * Movement pattern, which the exercise taxonomy in neither old app had.
 *
 * 5/3/1 prescribes assistance as "25–50 reps of push, 25–50 of pull,
 * 25–50 of single-leg or core" — a requirement stated entirely in terms
 * of pattern, with the exercise left to the lifter. Without this field an
 * assistance slot can only name a specific exercise, which is exactly the
 * rigidity that made LiftTracker's generated programs unusable.
 */
export const MOVEMENT_PATTERNS = [
  'horizontal-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'squat',
  'hinge',
  'lunge',
  'carry',
  'isolation',
  'core',
  /** Running, walking, swings — anything trained for conditioning. */
  'conditioning',
] as const

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]

/**
 * The three assistance categories 5/3/1 actually names, expressed over
 * movement patterns so any exercise can satisfy one.
 */
export const ASSISTANCE_CATEGORIES = {
  push: ['horizontal-push', 'vertical-push'],
  pull: ['horizontal-pull', 'vertical-pull'],
  'single-leg-core': ['lunge', 'core', 'carry'],
} as const satisfies Record<string, readonly MovementPattern[]>

export type AssistanceCategory = keyof typeof ASSISTANCE_CATEGORIES
