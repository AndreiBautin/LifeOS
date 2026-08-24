import { assembleProgram } from '@/domain/assembly/assemble'
import type { ProgramRecipe } from '@/domain/assembly/recipe'
import { defaultRecipe, DEFAULT_ASSISTANCE } from '@/domain/assembly/recipe'
import { builtInExercises, MAIN_LIFT_SLUGS } from '@/domain/exercises/catalogue'
import { CANONICAL_531_WEEKS, DEFAULT_BBB } from '@/domain/framework/five-three-one'
import type { IdGenerator } from '@/domain/ids/ids'
import { asExerciseId, asProgramId } from '@/domain/ids/ids'
import type { ProgramTemplate } from '@/domain/programs/program'
import { findSplit } from '@/domain/splits/split'

/**
 * The programs the app ships with.
 *
 * Each one is produced by the same assembler a lifter's own program goes
 * through, from a recipe with nothing special about it. That is the test
 * that the builder is genuinely general rather than 5/3/1 with an
 * editor bolted on: if a built-in needed a code path of its own, the
 * builder would not be able to express it either.
 *
 * They are stored as ordinary editable templates. `origin: 'built-in'`
 * only means the app can offer to restore the original — it confers no
 * privilege and nothing about them is locked.
 */

const MAIN_LIFTS = {
  squat: asExerciseId(MAIN_LIFT_SLUGS.squat),
  bench: asExerciseId(MAIN_LIFT_SLUGS.bench),
  deadlift: asExerciseId(MAIN_LIFT_SLUGS.deadlift),
  press: asExerciseId(MAIN_LIFT_SLUGS.press),
}

interface BuiltInDefinition {
  readonly id: string
  readonly recipe: ProgramRecipe
}

const DEFINITIONS: readonly BuiltInDefinition[] = [
  {
    id: 'built-in-531-bbb',
    recipe: defaultRecipe(MAIN_LIFTS, {
      name: '5/3/1 BBB + RP assistance',
      description:
        'The default. 5/3/1 sets the main work and Boring But Big supplies the supplemental volume; assistance is filled to each muscle’s weekly target, ramped across the cycle and cut on the deload. Four days, one main lift each.',
      splitId: 'four-day-main',
    }),
  },
  {
    id: 'built-in-531-bbb-ul',
    recipe: defaultRecipe(MAIN_LIFTS, {
      name: '5/3/1 BBB — Upper / Lower',
      description:
        'The same framework laid out as upper and lower days, which spreads chest and back volume more evenly across the week than following each main lift with its own assistance.',
      splitId: 'upper-lower-4',
    }),
  },
  {
    id: 'built-in-531-ppl',
    recipe: defaultRecipe(MAIN_LIFTS, {
      name: '5/3/1 — 6-day Push / Pull / Legs',
      description:
        'High frequency. Four of the six days open with a main lift; the two pull days carry none and are given over entirely to back volume. First Set Last replaces Boring But Big, because six days of 5 × 10 is more than most people recover from.',
      splitId: 'ppl-6',
      framework: {
        ...defaultRecipe(MAIN_LIFTS).framework,
        supplemental: { ...DEFAULT_BBB, style: 'fsl', sets: 5, reps: 5 },
      },
    }),
  },
  {
    id: 'built-in-531-3day',
    recipe: defaultRecipe(MAIN_LIFTS, {
      name: '5/3/1 — 3-day rotating',
      description:
        'Three sessions a week with the four lifts rotating, so the pattern closes every four weeks rather than every one. For a limited schedule, or for keeping strength while life is busy.',
      splitId: 'three-day-rotating',
      assistance: { ...DEFAULT_ASSISTANCE, maxSlotsPerDay: 4 },
    }),
  },
  {
    id: 'built-in-531-peaking',
    recipe: defaultRecipe(MAIN_LIFTS, {
      name: '5/3/1 → Peak and test',
      description:
        'Three cycles of 5/3/1 BBB, then a short peaking block that strips the volume and finishes by working up to a new one-rep max. Training maxes are re-derived from what you actually hit.',
      splitId: 'four-day-main',
      cycles: {
        count: 3,
        peaking: { enabled: true, rampPercents: [92.5, 97.5], testOpenerPercent: 100 },
      },
    }),
  },
  {
    id: 'built-in-hypertrophy',
    recipe: defaultRecipe(MAIN_LIFTS, {
      name: 'Hypertrophy block — volume only',
      description:
        'No percentage work. The main lifts are dropped to a single moderate top set and the rest of the session is autoregulated volume against your landmarks, ramping MEV toward MAV across the cycle. A hypertrophy phase between strength blocks.',
      splitId: 'ppl-6',
      framework: {
        ...defaultRecipe(MAIN_LIFTS).framework,
        includeWarmups: false,
        supplemental: { ...DEFAULT_BBB, style: 'none' },
        weeks: CANONICAL_531_WEEKS.map((week) => ({
          ...week,
          sets: week.sets.slice(0, 1).map((set) => ({ ...set, reps: 8, isAmrap: false })),
        })),
      },
      assistance: { ...DEFAULT_ASSISTANCE, maxSlotsPerDay: 6, maxSetsPerSlot: 5 },
    }),
  },
]

export function builtInPrograms(ids: IdGenerator, now: Date): readonly ProgramTemplate[] {
  const exercises = builtInExercises()

  return DEFINITIONS.flatMap((definition) => {
    const split = findSplit(definition.recipe.splitId)
    if (split === undefined) return []

    const assembled = assembleProgram(definition.recipe, asProgramId(definition.id), {
      exercises,
      split,
      ids,
      now,
    })

    return [{ ...assembled, origin: 'built-in' as const }]
  })
}

export const BUILT_IN_PROGRAM_COUNT = DEFINITIONS.length
