import type { Exercise, LoadBasis } from './exercise'
import type { FailureSafety, Sfr, SystemicCost, TrainingIntent } from './loading'
import type { Equipment, MovementPattern, MuscleGroup } from './taxonomy'

/**
 * The exercise library — a garage gym, not a commercial one.
 *
 * Barbell, dumbbells, a kettlebell, a pull-up bar and bodyweight. No
 * cables, no machines, no pec deck. That constraint matters more than it
 * looks: the highest-SFR hypertrophy work is usually cable and machine
 * work, so a garage gym has to buy its volume with movements that cost
 * more, and the fatigue model has to know that.
 *
 * Every entry carries four fields the generic catalogue did not:
 *
 *   - `intent` — strength (one of the three lifts the total is made of),
 *     hypertrophy, or conditioning. Not the same as rep range.
 *   - `sfr` — stimulus-to-fatigue ratio, 1–5.
 *   - `systemicCost` — whole-body cost per working set, where a heavy
 *     squat set is ~1.0.
 *   - `safeToFail` — whether the last work set should be taken to failure.
 */

interface CatalogueEntry {
  readonly slug: string
  readonly name: string
  readonly primaryMuscle: MuscleGroup
  readonly secondaryMuscles?: readonly MuscleGroup[]
  readonly equipment: Equipment
  readonly pattern: MovementPattern
  readonly isCompound: boolean
  readonly intent: TrainingIntent
  readonly sfr: Sfr
  readonly systemicCost?: SystemicCost
  readonly safeToFail: FailureSafety
  readonly isUnilateral?: boolean
  readonly isCompetition?: boolean
  readonly loadBasis?: LoadBasis
  readonly defaultRepRange?: { readonly low: number; readonly high: number }
  readonly defaultRestSeconds?: number
  readonly notes?: string
}

/**
 * The three lifts the total is made of. These are the only exercises with
 * `intent: 'strength'`, and the only ones RTS autoregulation applies to.
 */
export const STRENGTH_LIFT_SLUGS = {
  squat: 'low-bar-squat',
  bench: 'bench-press',
  deadlift: 'sumo-deadlift',
} as const

/** Two minutes on everything, as actually trained. */
const REST = 120
const REST_HEAVY = 180

const ENTRIES: readonly CatalogueEntry[] = [
  /* ---- The total ---------------------------------------------------- */
  {
    slug: 'bench-press',
    name: 'Bench Press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'front-delts'],
    equipment: 'barbell',
    pattern: 'horizontal-push',
    isCompound: true,
    intent: 'strength',
    sfr: 3,
    systemicCost: 0.55,
    // No spotter in a garage. A failed rep here is an emergency.
    safeToFail: false,
    isCompetition: true,
    loadBasis: 'estimated-1rm',
    defaultRepRange: { low: 3, high: 6 },
    defaultRestSeconds: REST_HEAVY,
  },
  {
    slug: 'low-bar-squat',
    name: 'Low Bar Squat (Competition)',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'hamstrings', 'core'],
    equipment: 'barbell',
    pattern: 'squat',
    isCompound: true,
    intent: 'strength',
    sfr: 2,
    systemicCost: 0.9,
    safeToFail: false,
    isCompetition: true,
    loadBasis: 'estimated-1rm',
    defaultRepRange: { low: 3, high: 6 },
    defaultRestSeconds: REST_HEAVY,
  },
  {
    slug: 'sumo-deadlift',
    name: 'Sumo Deadlift (Competition)',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings', 'quads', 'upper-back', 'forearms'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'strength',
    sfr: 1,
    systemicCost: 1,
    // Survivable to fail, and still a bad idea: the fatigue vastly
    // outruns the stimulus and form breaks where it matters most.
    safeToFail: false,
    isCompetition: true,
    loadBasis: 'estimated-1rm',
    defaultRepRange: { low: 1, high: 5 },
    defaultRestSeconds: REST_HEAVY,
  },

  /* ---- Chest -------------------------------------------------------- */
  {
    slug: 'dips',
    name: 'Dips',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'front-delts'],
    equipment: 'bodyweight',
    pattern: 'horizontal-push',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.3,
    safeToFail: true,
    loadBasis: 'bodyweight',
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Back --------------------------------------------------------- */
  {
    slug: 'pull-up',
    name: 'Pull-Up',
    primaryMuscle: 'lats',
    secondaryMuscles: ['biceps', 'upper-back', 'forearms'],
    equipment: 'bodyweight',
    pattern: 'vertical-pull',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.3,
    safeToFail: true,
    loadBasis: 'bodyweight',
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
    notes: 'The width builder. Tier 2 priority — worth the systemic cost.',
  },
  {
    slug: 'chin-up',
    name: 'Chin-Up',
    primaryMuscle: 'lats',
    secondaryMuscles: ['biceps', 'upper-back'],
    equipment: 'bodyweight',
    pattern: 'vertical-pull',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.28,
    safeToFail: true,
    loadBasis: 'bodyweight',
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
    notes: 'Doubles as biceps volume, which matters when arms are tier 1.',
  },
  {
    slug: 'barbell-row',
    name: 'Barbell Row',
    primaryMuscle: 'upper-back',
    secondaryMuscles: ['lats', 'biceps', 'rear-delts'],
    equipment: 'barbell',
    pattern: 'horizontal-pull',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.45,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Shoulders ---------------------------------------------------- */
  {
    slug: 'overhead-press',
    name: 'Overhead Press',
    primaryMuscle: 'front-delts',
    secondaryMuscles: ['triceps', 'side-delts', 'core'],
    equipment: 'barbell',
    pattern: 'vertical-push',
    isCompound: true,
    // Heavy, but not part of the total. Trained at 3–6 for hypertrophy.
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.5,
    safeToFail: true,
    loadBasis: 'estimated-1rm',
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST_HEAVY,
    notes: 'Heavy hypertrophy, not a strength lift. Volume counts toward front delts and triceps.',
  },
  {
    slug: 'db-lateral-raise',
    name: 'Dumbbell Lateral Raise',
    primaryMuscle: 'side-delts',
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.05,
    safeToFail: false,
    /*
     * Up to thirty, not twenty, because the dumbbells stop at 25 lb.
     *
     * Progressive overload has to come from somewhere, and with no
     * heavier bells to move to the only direction left is reps. A side
     * delt set at 25 lb for twenty-eight is still close to failure and
     * still counts; capping the range at twenty would end the overload
     * the week the top of it is reached.
     */
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
    notes: 'The highest-SFR movement available here. Tier 1 side delts are built on this.',
  },
  {
    slug: 'db-front-raise',
    name: 'Dumbbell Front Raise',
    primaryMuscle: 'front-delts',
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.05,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
    notes: 'Largely redundant with pressing. Rarely needed unless front delts are prioritised.',
  },
  {
    slug: 'rear-delt-raise',
    name: 'Rear Delt Raise',
    primaryMuscle: 'rear-delts',
    secondaryMuscles: ['upper-back'],
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.05,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Biceps ------------------------------------------------------- */
  {
    slug: 'barbell-curl',
    name: 'Barbell Curl',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.1,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'ez-bar-curl',
    name: 'EZ Bar Curl',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'ez-bar',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.08,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'reverse-curl',
    name: 'Reverse Curl',
    primaryMuscle: 'forearms',
    secondaryMuscles: ['biceps'],
    equipment: 'ez-bar',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.07,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Triceps ------------------------------------------------------ */
  {
    slug: 'skullcrusher',
    name: 'Skullcrusher',
    primaryMuscle: 'triceps',
    equipment: 'ez-bar',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.12,
    // A bar over the face with no spotter. Stop at one rep in reserve.
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'french-press',
    name: 'French Press',
    primaryMuscle: 'triceps',
    equipment: 'ez-bar',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.12,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
    notes:
      'Overhead, so the long head gets a real stretch. Failure just means lowering behind the head.',
  },

  /* ---- Forearms ----------------------------------------------------- */
  {
    slug: 'bb-wrist-curl',
    name: 'Barbell Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'barbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'bb-reverse-wrist-curl',
    name: 'Barbell Reverse Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'barbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    safeToFail: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'db-wrist-curl',
    name: 'Dumbbell Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    safeToFail: true,
    isUnilateral: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'db-reverse-wrist-curl',
    name: 'Dumbbell Reverse Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    safeToFail: true,
    isUnilateral: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Traps -------------------------------------------------------- */
  {
    slug: 'barbell-shrug',
    name: 'Barbell Shrug',
    primaryMuscle: 'upper-back',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.18,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Calves ------------------------------------------------------- */
  {
    slug: 'barbell-calf-raise',
    name: 'Barbell Calf Raise',
    primaryMuscle: 'calves',
    equipment: 'barbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.15,
    // A loaded bar on your back with your heels at full stretch is not a
    // position to reach failure in.
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Quads -------------------------------------------------------- */
  {
    slug: 'high-bar-squat',
    name: 'High Bar Squat',
    primaryMuscle: 'quads',
    secondaryMuscles: ['glutes', 'core'],
    equipment: 'barbell',
    pattern: 'squat',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 2,
    systemicCost: 0.8,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST_HEAVY,
  },
  {
    slug: 'front-squat',
    name: 'Front Squat',
    primaryMuscle: 'quads',
    secondaryMuscles: ['core', 'glutes'],
    equipment: 'barbell',
    pattern: 'squat',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 2,
    systemicCost: 0.75,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST_HEAVY,
  },

  /* ---- Posterior chain ---------------------------------------------- */
  {
    slug: 'conventional-deadlift',
    name: 'Conventional Deadlift',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'upper-back', 'lats', 'forearms'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 1,
    systemicCost: 0.95,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST_HEAVY,
  },
  {
    slug: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'upper-back'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 2,
    systemicCost: 0.5,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'good-morning',
    name: 'Good Morning',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'core'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 2,
    systemicCost: 0.55,
    safeToFail: false,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'kb-single-leg-rdl',
    name: 'Kettlebell Single Leg RDL',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'core'],
    equipment: 'kettlebell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.25,
    safeToFail: true,
    isUnilateral: true,
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Core --------------------------------------------------------- */
  {
    slug: 'ab-wheel',
    name: 'Ab Wheel Rollout',
    primaryMuscle: 'core',
    equipment: 'other',
    pattern: 'core',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.12,
    safeToFail: false,
    loadBasis: 'bodyweight',
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },
  {
    slug: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    primaryMuscle: 'core',
    secondaryMuscles: ['forearms'],
    equipment: 'bodyweight',
    pattern: 'core',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.12,
    safeToFail: false,
    loadBasis: 'bodyweight',
    defaultRepRange: { low: 5, high: 30 },
    defaultRestSeconds: REST,
  },

  /* ---- Conditioning -------------------------------------------------- */
  {
    slug: 'running',
    name: 'Running',
    primaryMuscle: 'quads',
    secondaryMuscles: ['hamstrings', 'calves'],
    equipment: 'bodyweight',
    pattern: 'conditioning',
    isCompound: true,
    intent: 'conditioning',
    sfr: 2,
    // Impact and the eccentric load make running expensive for a lifter,
    // and it competes directly with lower-body recovery.
    systemicCost: 0.5,
    safeToFail: true,
    loadBasis: 'bodyweight',
    defaultRestSeconds: 0,
    notes:
      'Ease in. The main driver of VO2max and mile time, and the cardio that most interferes with squatting.',
  },
  {
    slug: 'incline-walk',
    name: 'Incline Walking',
    primaryMuscle: 'calves',
    secondaryMuscles: ['glutes', 'hamstrings'],
    equipment: 'bodyweight',
    pattern: 'conditioning',
    isCompound: true,
    intent: 'conditioning',
    sfr: 4,
    // Almost free. The reason it is the default cardio during a cut.
    systemicCost: 0.08,
    safeToFail: true,
    loadBasis: 'bodyweight',
    defaultRestSeconds: 0,
    notes:
      'Lowest-interference cardio available. Burns without competing with lower-body recovery.',
  },
  {
    slug: 'kb-swing',
    name: 'Kettlebell Swing',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings', 'core', 'forearms'],
    equipment: 'kettlebell',
    pattern: 'conditioning',
    isCompound: true,
    intent: 'conditioning',
    sfr: 3,
    systemicCost: 0.35,
    safeToFail: true,
    defaultRepRange: { low: 15, high: 25 },
    defaultRestSeconds: 60,
    notes:
      'Conditioning that also loads the posterior chain — count it against hip fatigue, not as free cardio.',
  },

  /* ---- Warm-ups ------------------------------------------------------ */
  {
    slug: 'shoulder-dislocation',
    name: 'Shoulder Dislocations',
    primaryMuscle: 'rear-delts',
    equipment: 'band',
    pattern: 'isolation',
    isCompound: false,
    intent: 'conditioning',
    sfr: 5,
    systemicCost: 0.01,
    safeToFail: true,
    defaultRepRange: { low: 10, high: 20 },
    defaultRestSeconds: 0,
    notes: 'Upper-day warm-up. Contributes no training volume.',
  },
  {
    slug: 'rotator-cuff-plate',
    name: 'Rotator Cuff Plate Work',
    primaryMuscle: 'rear-delts',
    equipment: 'other',
    pattern: 'isolation',
    isCompound: false,
    intent: 'conditioning',
    sfr: 5,
    systemicCost: 0.02,
    safeToFail: true,
    defaultRepRange: { low: 10, high: 20 },
    defaultRestSeconds: 0,
    notes: 'Upper-day warm-up. Contributes no training volume.',
  },
  {
    slug: 'foam-roll',
    name: 'Foam Rolling',
    primaryMuscle: 'quads',
    equipment: 'other',
    pattern: 'conditioning',
    isCompound: false,
    intent: 'conditioning',
    sfr: 5,
    systemicCost: 0,
    safeToFail: true,
    defaultRestSeconds: 0,
    notes: 'Lower-day warm-up. Contributes no training volume.',
  },
]

export function builtInExercises(): readonly Exercise[] {
  return ENTRIES.map((entry) => ({
    id: entry.slug as Exercise['id'],
    name: entry.name,
    primaryMuscle: entry.primaryMuscle,
    secondaryMuscles: entry.secondaryMuscles ?? [],
    equipment: entry.equipment,
    pattern: entry.pattern,
    isCompound: entry.isCompound,
    isUnilateral: entry.isUnilateral ?? false,
    isCompetition: entry.isCompetition ?? false,
    loadBasis: entry.loadBasis ?? 'absolute-only',
    intent: entry.intent,
    sfr: entry.sfr,
    ...(entry.systemicCost !== undefined ? { systemicCost: entry.systemicCost } : {}),
    safeToFail: entry.safeToFail,
    ...(entry.defaultRepRange !== undefined ? { defaultRepRange: entry.defaultRepRange } : {}),
    ...(entry.defaultRestSeconds !== undefined
      ? { defaultRestSeconds: entry.defaultRestSeconds }
      : {}),
    ...(entry.notes !== undefined ? { notes: entry.notes } : {}),
    isBuiltIn: true,
    isArchived: false,
  }))
}

/** Exercises that build the total, in the order a session runs them. */
export function strengthLifts(): readonly Exercise[] {
  return builtInExercises().filter((exercise) => exercise.intent === 'strength')
}

/** Everything that counts toward per-muscle volume. */
export function hypertrophyExercises(): readonly Exercise[] {
  return builtInExercises().filter((exercise) => exercise.intent === 'hypertrophy')
}

/** Warm-ups and cardio: prescribed, performed, and worth zero volume. */
export function conditioningExercises(): readonly Exercise[] {
  return builtInExercises().filter((exercise) => exercise.intent === 'conditioning')
}

/**
 * The warm-up before each kind of day, with the reps actually prescribed.
 *
 * A range is right for work sets, where the lifter decides inside it. It
 * is wrong here: "10–20" on a mobility drill is a question rather than an
 * instruction, and the answer a lifter picks between sets is whichever
 * number gets them to the bar soonest. A warm-up is done properly or not
 * at all, so it says how many.
 */
export const WARM_UPS = {
  upper: [
    { slug: 'shoulder-dislocation', sets: 2, reps: 10 },
    { slug: 'rotator-cuff-plate', sets: 2, reps: 12 },
  ],
  lower: [{ slug: 'foam-roll', sets: 1, reps: 10 }],
} as const

export const WARM_UP_SLUGS = {
  upper: ['shoulder-dislocation', 'rotator-cuff-plate'],
  lower: ['foam-roll'],
} as const

export const BUILT_IN_EXERCISE_COUNT = ENTRIES.length
