import type { Exercise, LoadBasis } from './exercise'
import type { Sfr, SystemicCost, TrainingIntent } from './loading'
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
  readonly isUnilateral?: boolean
  readonly isCompetition?: boolean
  readonly loadBasis?: LoadBasis
  readonly defaultRestSeconds?: number
  readonly notes?: string
}

/**
 * The three lifts the total is made of — the competition version of each.
 *
 * `intent: 'strength'` is wider than this: the bench variations carry it
 * too, because RTS autoregulation applies to them in exactly the same way.
 * What this map picks out is narrower and is what the character sheet
 * scores — only these three have `isCompetition`, and only these three
 * feed a total. See {@link STRENGTH_VARIATIONS}.
 */
export const STRENGTH_LIFT_SLUGS = {
  squat: 'low-bar-squat',
  bench: 'paused-bench-press',
  deadlift: 'sumo-deadlift',
} as const

/**
 * The variations a lift rotates through, one per session in the week.
 *
 * The competition version is always first, so a lift trained once a week
 * gets it and nothing else — a rotation must not be able to cost a
 * single-session lift the thing being measured.
 *
 * This is a rotation, not an anchor. `RpDay.anchors` was removed for good
 * reason and must not come back: a day pinned to a slug goes on
 * scheduling that exercise long after the tiers that justified it have
 * moved. Here nothing is pinned to a *day*. The day asks for the bench,
 * and which bench it gets falls out of how many bench sessions the tiers
 * bought and which one this is. Drop the bench to tier 2 and it takes the
 * first two; raise it and it takes all three.
 */
export const STRENGTH_VARIATIONS: Record<keyof typeof STRENGTH_LIFT_SLUGS, readonly string[]> = {
  squat: ['low-bar-squat', 'high-bar-squat'],
  // Two sessions, two variations. The close grip left the rotation with
  // the third bench day — a rotation longer than the frequency simply
  // never reaches its own end, so the entry was describing a session that
  // does not happen.
  bench: ['paused-bench-press', 'bench-press'],
  deadlift: ['sumo-deadlift'],
}

/**
 * What a variation's max is worth relative to the lift it descends from,
 * until the lifter has measured it.
 *
 * A suggestion, not a prescription, and only used when there is no
 * measured estimate of its own — the moment one exists it wins, because a
 * number off a bar beats a number off a ratio. Without this the first
 * paused and close-grip sessions would show no suggested load at all,
 * which is survivable (an RPE set is performable without one) and a poor
 * way to meet a new exercise.
 */
export const VARIATION_OF: Readonly<
  Record<string, { readonly of: string; readonly factor: number }>
> = {
  // Touch-and-go is *heavier* than the paused version — no pause means no
  // loss of stretch reflex — so this factor is above one. It reads wrong
  // until you remember which lift is the reference.
  'bench-press': { of: 'paused-bench-press', factor: 1.05 },
  'close-grip-bench-press': { of: 'paused-bench-press', factor: 0.95 },
  /*
   * Low bar allows more than high bar for most people — shorter moment arm
   * at the hip, more posterior chain — so the factor is below one. Ten per
   * cent is the middle of the range usually quoted, and it is a starting
   * position rather than a claim: the first top set logged against this
   * slug replaces it, and a measured number always wins.
   */
  'high-bar-squat': { of: 'low-bar-squat', factor: 0.9 },
}

/**
 * Pulls done in straps, and what that costs the forearms.
 *
 * The forearm credit on a heavy pull is *grip* — holding the bar is the
 * work. Put wrist straps on and that work is gone, while the lat, back
 * and hamstring credit is untouched. Leaving it in the catalogue would
 * have the app believe a strapped deadlift trains the forearms, which is
 * how a muscle ends up with twelve credited sets against a target of six
 * and no direct work scheduled at all.
 *
 * A list rather than a setting, deliberately. This is one lifter's
 * garage and the catalogue is how content is delivered here; a boolean
 * would mean a settings field, a sync key, a screen and a migration to
 * express something that is one line to reverse — delete the constant
 * and the credit comes back.
 *
 * The kettlebell swing is **not** on it. Nobody straps a swing: the bell
 * is light enough that grip is not the limiter, and the hold is dynamic.
 * Curls are not on it either — their forearm involvement is wrist and
 * elbow work rather than grip, and a hammer curl trains the
 * brachioradialis directly.
 */
const STRAPPED: readonly string[] = [
  'sumo-deadlift',
  'conventional-deadlift',
  'romanian-deadlift',
  'barbell-row',
  'pull-up',
  'chin-up',
  'barbell-shrug',
  'hanging-leg-raise',
]

/** Two minutes on everything, as actually trained. */
const REST = 120
const REST_HEAVY = 180

const ENTRIES: readonly CatalogueEntry[] = [
  /* ---- The total ---------------------------------------------------- */
  {
    slug: 'bench-press',
    name: 'Touch-and-Go Bench Press',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'front-delts'],
    equipment: 'barbell',
    pattern: 'horizontal-push',
    isCompound: true,
    intent: 'strength',
    sfr: 3,
    systemicCost: 0.55,
    // No spotter in a garage. A failed rep here is an emergency.
    loadBasis: 'estimated-1rm',
    defaultRestSeconds: REST_HEAVY,
  },
  /*
   * Two bench variations, and they are separate exercises rather than a
   * label on the same one.
   *
   * A close-grip bench is not a bench press done differently; it is a
   * lift with its own maximum, roughly a tenth lighter. Sharing an
   * estimate would make the suggested load wrong in the same direction
   * every week — RTS tolerates a wrong suggestion, because the lifter
   * loads what feels like the RPE, but it should not be systematically
   * wrong — and it would make history unable to answer what the close
   * grip actually does.
   *
   * The **paused** version is the competition lift, because a raw meet
   * bench is judged on a pause and a touch-and-go single is a different
   * measurement. So the paused bench is what the character sheet scores
   * and what feeds the total; the other two are training. The cost is
   * that the scored number now moves on one session a week rather than
   * three — honest, because the other two days are not measuring the lift
   * being scored, but slower to respond.
   */
  {
    slug: 'paused-bench-press',
    name: 'Bench Press (Competition)',
    primaryMuscle: 'chest',
    secondaryMuscles: ['triceps', 'front-delts'],
    equipment: 'barbell',
    pattern: 'horizontal-push',
    isCompound: true,
    intent: 'strength',
    sfr: 3,
    systemicCost: 0.55,
    isCompetition: true,
    loadBasis: 'estimated-1rm',
    defaultRestSeconds: REST_HEAVY,
    notes: 'One second on the chest, dead still. The command, not a touch.',
  },
  {
    slug: 'close-grip-bench-press',
    name: 'Close-Grip Bench Press',
    primaryMuscle: 'chest',
    // The triceps do enough here to lead, but the chest is still the
    // primary — a close grip narrows the leverage, it does not change
    // which muscle is being trained.
    secondaryMuscles: ['triceps', 'front-delts'],
    equipment: 'barbell',
    pattern: 'horizontal-push',
    isCompound: true,
    intent: 'strength',
    sfr: 3,
    systemicCost: 0.5,
    loadBasis: 'estimated-1rm',
    defaultRestSeconds: REST_HEAVY,
    notes: 'Index fingers on the smooth. Touch-and-go.',
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
    isCompetition: true,
    loadBasis: 'estimated-1rm',
    defaultRestSeconds: REST_HEAVY,
  },
  {
    slug: 'sumo-deadlift',
    name: 'Sumo Deadlift (Competition)',
    primaryMuscle: 'glutes',
    secondaryMuscles: ['hamstrings', 'quads', 'upper-back', 'forearms', 'traps'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'strength',
    sfr: 1,
    systemicCost: 1,
    // Survivable to fail, and still a bad idea: the fatigue vastly
    // outruns the stimulus and form breaks where it matters most.
    isCompetition: true,
    loadBasis: 'estimated-1rm',
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
    loadBasis: 'bodyweight',
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
    loadBasis: 'bodyweight',
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
    loadBasis: 'bodyweight',
    defaultRestSeconds: REST,
    notes: 'Doubles as biceps volume, which matters when arms are tier 1.',
  },
  {
    slug: 'barbell-row',
    name: 'Barbell Row',
    primaryMuscle: 'upper-back',
    secondaryMuscles: ['lats', 'biceps', 'rear-delts', 'traps'],
    equipment: 'barbell',
    pattern: 'horizontal-pull',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 3,
    systemicCost: 0.45,
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
    loadBasis: 'estimated-1rm',
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
    /*
     * Up to thirty, not twenty, because the dumbbells stop at 25 lb.
     *
     * Progressive overload has to come from somewhere, and with no
     * heavier bells to move to the only direction left is reps. A side
     * delt set at 25 lb for twenty-eight is still close to failure and
     * still counts; capping the range at twenty would end the overload
     * the week the top of it is reached.
     */
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
    defaultRestSeconds: REST,
  },
  /*
   * Two dumbbell curls, and the second one is not padding.
   *
   * The biceps are trained three times a week and had exactly two direct
   * options — a barbell curl and an EZ bar curl — so the picker's repeat
   * penalty had nothing to reach for and the same movement came up twice
   * most weeks. Four options is what lets "do not repeat within the
   * week" actually mean something for this muscle.
   *
   * The hammer earns its place on top of that: a neutral grip shifts work
   * onto the brachialis and brachioradialis, which is why its forearm
   * credit is the point rather than a side effect.
   */
  {
    slug: 'db-curl',
    name: 'Dumbbell Curl',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    // One arm at a time if you like; the credit is the same either way,
    // and `isUnilateral` is about how a set is counted, not how it is
    // performed. A pair of dumbbells curled together is one set.
    sfr: 5,
    systemicCost: 0.08,
    defaultRestSeconds: REST,
  },
  {
    slug: 'hammer-curl',
    name: 'Hammer Curl',
    primaryMuscle: 'biceps',
    secondaryMuscles: ['forearms'],
    equipment: 'dumbbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.08,
    defaultRestSeconds: REST,
    notes: 'Neutral grip throughout — brachialis and brachioradialis, not just biceps.',
  },
  {
    slug: 'reverse-curl',
    name: 'Reverse Curl',
    primaryMuscle: 'forearms',
    secondaryMuscles: ['biceps'],
    equipment: 'ez-bar',
    /*
     * Extension, not generic isolation.
     *
     * A reverse curl is a pronated-grip elbow flexion: the wrist
     * extensors hold the bar against gravity for every rep, which is the
     * same side of the forearm a reverse wrist curl trains. Under
     * `isolation` it collided with nothing, so the repeat penalty — keyed
     * on `primaryMuscle|pattern` — could not see that it and a reverse
     * wrist curl are one movement, and the week scheduled both. Two
     * extensor slots, the flexors untrained, and a forearm target
     * reported as met.
     *
     * The same bug the wrist patterns were introduced to fix; this
     * exercise was simply not named when they were.
     */
    pattern: 'wrist-extension',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.07,
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
    pattern: 'wrist-flexion',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    defaultRestSeconds: REST,
  },
  {
    slug: 'bb-reverse-wrist-curl',
    name: 'Barbell Reverse Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'barbell',
    pattern: 'wrist-extension',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    defaultRestSeconds: REST,
  },
  {
    slug: 'db-wrist-curl',
    name: 'Dumbbell Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'dumbbell',
    pattern: 'wrist-flexion',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    isUnilateral: true,
    defaultRestSeconds: REST,
  },
  {
    slug: 'db-reverse-wrist-curl',
    name: 'Dumbbell Reverse Wrist Curl',
    primaryMuscle: 'forearms',
    equipment: 'dumbbell',
    pattern: 'wrist-extension',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 5,
    systemicCost: 0.04,
    isUnilateral: true,
    defaultRestSeconds: REST,
  },

  /* ---- Traps -------------------------------------------------------- */
  {
    slug: 'barbell-shrug',
    name: 'Barbell Shrug',
    primaryMuscle: 'traps',
    secondaryMuscles: ['forearms'],
    equipment: 'barbell',
    pattern: 'isolation',
    isCompound: false,
    intent: 'hypertrophy',
    sfr: 4,
    systemicCost: 0.18,
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
    /*
     * Strength rather than hypertrophy, because this is the squat's second
     * variation and a rotation member is run the same way the competition
     * lift is: a top set of reps at an RPE, with back-offs derived from it.
     *
     * The cost is that the quads lose one of their two direct hypertrophy
     * options and are left with the front squat. That is affordable here
     * and worth stating: both squats name the quads as their *primary*
     * muscle, so the strength work already pays them heavily before the
     * fill chooses anything, and the fill subtracts what it spent.
     */
    intent: 'strength',
    // Unchanged from when this was an accessory. High bar genuinely is
    // slightly cheaper than low bar — more upright, less hip — and the
    // assembler should go on believing that.
    sfr: 2,
    systemicCost: 0.8,
    loadBasis: 'estimated-1rm',
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
    defaultRestSeconds: REST_HEAVY,
  },

  /* ---- Posterior chain ---------------------------------------------- */
  {
    slug: 'conventional-deadlift',
    name: 'Conventional Deadlift',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'upper-back', 'lats', 'forearms', 'traps'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 1,
    systemicCost: 0.95,
    defaultRestSeconds: REST_HEAVY,
  },
  {
    slug: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    primaryMuscle: 'hamstrings',
    secondaryMuscles: ['glutes', 'upper-back', 'traps'],
    equipment: 'barbell',
    pattern: 'hinge',
    isCompound: true,
    intent: 'hypertrophy',
    sfr: 2,
    systemicCost: 0.5,
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
    loadBasis: 'bodyweight',
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
    loadBasis: 'bodyweight',
    defaultRestSeconds: REST,
  },

  /* ---- Conditioning -------------------------------------------------- */
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
    loadBasis: 'bodyweight',
    defaultRestSeconds: 0,
    notes:
      'Lowest-interference cardio available. Burns without competing with lower-body recovery.',
  },
  /*
   * Back on the treadmill, and the reason it left no longer holds.
   *
   * It was withdrawn because "conditioning belongs on the lower days, and
   * a run is not what they need" — true while conditioning sat on two
   * days beside the squat and the deadlift, and false now that Zone 2
   * runs on all three upper days where it interferes with nothing.
   *
   * Shares the Zone 2 label with the walk on purpose: they are the same
   * work under two names, which is why there are two conditioning
   * domains rather than three. What separates them is systemic cost, and
   * the exercise already carries that.
   */
  {
    slug: 'running',
    name: 'Easy Run',
    primaryMuscle: 'calves',
    secondaryMuscles: ['glutes', 'hamstrings', 'quads'],
    equipment: 'bodyweight',
    pattern: 'conditioning',
    isCompound: true,
    intent: 'conditioning',
    sfr: 3,
    // Four times the walk. Real eccentric loading through the calves and
    // hamstrings, which is exactly what makes it interfere with lifting
    // in a way the walk does not.
    systemicCost: 0.32,
    loadBasis: 'bodyweight',
    defaultRestSeconds: 0,
    notes: 'Conversational pace throughout. If you cannot talk, you are running the wrong session.',
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
    defaultRestSeconds: 0,
    notes: 'Upper-day warm-up. Contributes no training volume.',
  },
  {
    slug: 'band-pull-apart',
    name: 'Band Pull-Aparts',
    primaryMuscle: 'rear-delts',
    equipment: 'band',
    pattern: 'isolation',
    isCompound: false,
    intent: 'conditioning',
    sfr: 5,
    systemicCost: 0.01,
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
    defaultRestSeconds: 0,
    notes: 'Lower-day warm-up. Contributes no training volume.',
  },
]

export function builtInExercises(): readonly Exercise[] {
  return ENTRIES.map((entry) => ({
    id: entry.slug as Exercise['id'],
    name: entry.name,
    primaryMuscle: entry.primaryMuscle,
    // Straps take the grip out of a pull, so they take the forearms out
    // of its credit. Applied here rather than edited into every entry, so
    // the reason stays in one place and reversing it is one line.
    secondaryMuscles: STRAPPED.includes(entry.slug)
      ? (entry.secondaryMuscles ?? []).filter((muscle) => muscle !== 'forearms')
      : (entry.secondaryMuscles ?? []),
    equipment: entry.equipment,
    pattern: entry.pattern,
    isCompound: entry.isCompound,
    isUnilateral: entry.isUnilateral ?? false,
    isCompetition: entry.isCompetition ?? false,
    loadBasis: entry.loadBasis ?? 'absolute-only',
    intent: entry.intent,
    sfr: entry.sfr,
    ...(entry.systemicCost !== undefined ? { systemicCost: entry.systemicCost } : {}),
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
/**
 * The warm-up routine, one set of each.
 *
 * Multiple sets were a habit rather than a decision. A warm-up is there
 * to move the joint through its range and raise tissue temperature, and
 * the second set of shoulder dislocations does neither of those any
 * better than the first — it just puts two rows on the screen for
 * something nobody counts. Twenty reps in one go is the same work, said
 * once.
 *
 * `note` carries what the rep count cannot. "1 × 20" is ambiguous for
 * anything done per side or per area, and a lifter reading it on a phone
 * between sets should not have to infer that a foam-rolling entry means
 * seven regions.
 */
export const WARM_UPS = {
  upper: [
    { slug: 'shoulder-dislocation', sets: 1, reps: 20 },
    { slug: 'rotator-cuff-plate', sets: 1, reps: 20, note: 'Twenty each side.' },
    { slug: 'band-pull-apart', sets: 1, reps: 20 },
  ],
  lower: [
    {
      slug: 'foam-roll',
      sets: 1,
      reps: 20,
      note: 'Hamstrings, quads, IT band, groin, lats, upper back, calves — twenty passes each.',
    },
  ],
} as const

export const WARM_UP_SLUGS = {
  upper: ['shoulder-dislocation', 'rotator-cuff-plate', 'band-pull-apart'],
  lower: ['foam-roll'],
} as const

export const BUILT_IN_EXERCISE_COUNT = ENTRIES.length
