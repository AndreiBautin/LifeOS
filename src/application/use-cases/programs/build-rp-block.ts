import { assembleRpProgram, defaultRpRecipe, type RpRecipe } from '@/domain/assembly/rp-assemble'
import type { ProgramId } from '@/domain/ids/ids'
import { asProgramId } from '@/domain/ids/ids'
import type { ProgramTemplate } from '@/domain/programs/program'
import type { AppSettings } from '@/domain/settings/settings'

import type { ProgramDeps } from './manage-programs'

/**
 * Building a block from the lifter's current settings.
 *
 * The recipe is assembled from settings rather than from a form, because
 * every input it needs — tiers, landmarks, days per week, block length —
 * is something the app is already autoregulating. Asking for them again
 * would let the two drift.
 */
export function recipeFromSettings(
  settings: AppSettings,
  overrides: Partial<RpRecipe> = {},
): RpRecipe {
  return defaultRpRecipe({
    muscleTiers: settings.muscleTiers,
    strengthTiers: settings.strengthTiers,
    landmarks: settings.landmarks,
    daysPerWeek: settings.daysPerWeek,
    weeksBeforeDeload: settings.weeksBeforeDeload,
    targetSessionMinutes: settings.targetSessionMinutes,
    settings: {
      units: settings.units,
      roundingIncrement: settings.roundingIncrement,
      defaultRestSeconds: 120,
    },
    ...overrides,
  })
}

export async function buildRpBlock(
  settings: AppSettings,
  deps: ProgramDeps,
  overrides: Partial<RpRecipe> = {},
): Promise<ProgramTemplate> {
  const program = assembleRpProgram(
    recipeFromSettings(settings, overrides),
    asProgramId(deps.ids.next()),
    {
      exercises: await deps.exercises.all(),
      ids: deps.ids,
      now: deps.clock.now(),
    },
  )

  await deps.programs.save(program)
  return program
}

/**
 * Rebuilds a block in place, keeping its id.
 *
 * Used when a tier, a landmark or the day count changes: the block a
 * lifter is running should reflect what they just told the app, and
 * making them delete and recreate it would lose the id every workout
 * logged against it refers to.
 *
 * The *running instance* is untouched — it holds a frozen snapshot, so a
 * cycle in progress keeps prescribing what it started with.
 */
export async function rebuildRpBlock(
  programId: ProgramId,
  settings: AppSettings,
  deps: ProgramDeps,
  overrides: Partial<RpRecipe> = {},
): Promise<ProgramTemplate> {
  const existing = await deps.programs.byId(programId)

  const rebuilt = assembleRpProgram(
    recipeFromSettings(settings, {
      ...(existing !== undefined ? { name: existing.name, description: existing.description } : {}),
      ...overrides,
    }),
    programId,
    {
      exercises: await deps.exercises.all(),
      ids: deps.ids,
      now: deps.clock.now(),
    },
  )

  const program: ProgramTemplate = {
    ...rebuilt,
    ...(existing !== undefined ? { origin: existing.origin, createdAt: existing.createdAt } : {}),
  }

  await deps.programs.save(program)
  return program
}
