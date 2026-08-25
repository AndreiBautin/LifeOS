import { assembleRpProgram, defaultRpRecipe, type RpRecipe } from '@/domain/assembly/rp-assemble'
import { builtInExercises } from '@/domain/exercises/catalogue'
import type { IdGenerator } from '@/domain/ids/ids'
import { asProgramId } from '@/domain/ids/ids'
import type { ProgramTemplate } from '@/domain/programs/program'

/**
 * The programs the app ships with.
 *
 * Each one is produced by the same assembler a lifter's own block goes
 * through, from a recipe with nothing special about it. That is the test
 * that the builder is genuinely general: if a built-in needed a code path
 * of its own, the builder would not be able to express it either.
 *
 * They are stored as ordinary editable templates. `origin: 'built-in'`
 * only means the app can offer to restore the original — it confers no
 * privilege and nothing about them is locked.
 *
 * The 5/3/1 definitions that used to sit here were removed once RTS
 * became the only way strength is run. They are in the git history if
 * they are ever wanted back; carrying two frameworks meant two of
 * everything — assembler, recipe, split vocabulary, progression — for a
 * methodology no longer used.
 */

interface BuiltInDefinition {
  readonly id: string
  readonly recipe: RpRecipe
}

/** The one block the app ships, and opens on. */
export const DEFAULT_PROGRAM_ID = 'built-in-rp-block'

const DEFINITIONS: readonly BuiltInDefinition[] = [
  {
    id: DEFAULT_PROGRAM_ID,
    recipe: defaultRpRecipe(),
  },
]

export function builtInPrograms(ids: IdGenerator, now: Date): readonly ProgramTemplate[] {
  const exercises = builtInExercises()

  return DEFINITIONS.map((definition) => ({
    ...assembleRpProgram(definition.recipe, asProgramId(definition.id), {
      exercises,
      ids,
      now,
    }),
    origin: 'built-in' as const,
  }))
}

export const BUILT_IN_PROGRAM_COUNT = DEFINITIONS.length

/** Exercise slugs that shipped once and have since been withdrawn. */
export const RETIRED_EXERCISE_SLUGS: readonly string[] = ['behind-back-shrug']

/** Ids of built-ins that shipped once and have since been withdrawn. */
export const RETIRED_BUILT_IN_PROGRAM_IDS: readonly string[] = [
  'built-in-rp-block-6day',
  'built-in-531-bbb',
  'built-in-531-bbb-ul',
  'built-in-531-ppl',
  'built-in-531-3day',
  'built-in-531-peaking',
  'built-in-hypertrophy',
]
