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

const DEFINITIONS: readonly BuiltInDefinition[] = [
  {
    id: 'built-in-rp-block',
    recipe: defaultRpRecipe(),
  },
  {
    id: 'built-in-rp-block-6day',
    recipe: defaultRpRecipe({
      name: 'RP block — 6-day push / pull / legs',
      description:
        'The same tiers and landmarks spread across six sessions. More room for a specialisation block, and shorter days.',
      daysPerWeek: 6,
    }),
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

/** Ids of built-ins that shipped once and have since been withdrawn. */
export const RETIRED_BUILT_IN_PROGRAM_IDS: readonly string[] = [
  'built-in-531-bbb',
  'built-in-531-bbb-ul',
  'built-in-531-ppl',
  'built-in-531-3day',
  'built-in-531-peaking',
  'built-in-hypertrophy',
]
