import { assembleRpProgram, defaultRpRecipe, type RpRecipe } from '@/domain/assembly/rp-assemble'
import type { Exercise } from '@/domain/exercises/exercise'
import type { IdGenerator } from '@/domain/ids/ids'
import { asProgramId } from '@/domain/ids/ids'
import type { ProgramDay, ProgramTemplate, ProgramWeek } from '@/domain/programs/program'
import type { ProgramPosition } from '@/domain/programs/position'
import type { AppSettings } from '@/domain/settings/settings'

/**
 * The program, derived from settings rather than stored.
 *
 * There is exactly one, it is always current, and nothing has to be
 * pressed to make it so. Changing a tier changes the next session.
 *
 * Deterministic on purpose: the same settings produce a byte-identical
 * program, including its slot ids. That is what makes deriving it viable
 * rather than merely possible — a workout in progress refers to its day
 * by position and its sets by index, and both stay valid across a
 * re-derivation. A random id generator here would produce a *different*
 * program every render, which is how deriving gets a bad name.
 */

const PROGRAM_ID = asProgramId('current')

/**
 * Ids seeded from nothing, so assembly is reproducible.
 *
 * The domain takes an id generator as a parameter precisely so a caller
 * can decide this. A program is the one place where identity should come
 * from the *content* rather than from a clock or a random source.
 */
function deterministicIds(): IdGenerator {
  let n = 0
  return {
    next: () => {
      n += 1
      return `s${String(n)}`
    },
  }
}

/**
 * A fixed timestamp, because a derived program has no meaningful age.
 *
 * `createdAt` on a template that is recomputed on demand would change on
 * every read, which makes two identical programs compare unequal and
 * turns any "has this changed?" check into a lie.
 */
const DERIVED_AT = '1970-01-01T00:00:00.000Z'

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
    excludedExercises: settings.excludedExercises,
    settings: {
      units: settings.units,
      roundingIncrement: settings.roundingIncrement,
      defaultRestSeconds: 120,
    },
    ...overrides,
  })
}

export function deriveProgram(
  settings: AppSettings,
  exercises: readonly Exercise[],
  overrides: Partial<RpRecipe> = {},
): ProgramTemplate {
  return assembleRpProgram(recipeFromSettings(settings, overrides), PROGRAM_ID, {
    exercises,
    ids: deterministicIds(),
    now: new Date(DERIVED_AT),
  })
}

/** The week a position points at, or undefined if it points nowhere. */
export function weekAt(
  program: ProgramTemplate,
  position: ProgramPosition,
): ProgramWeek | undefined {
  return program.blocks[position.blockIndex]?.weeks[position.weekIndex]
}

/** The day a position points at, or undefined if it points nowhere. */
export function dayAt(program: ProgramTemplate, position: ProgramPosition): ProgramDay | undefined {
  return weekAt(program, position)?.days[position.dayIndex]
}

/**
 * Pulls a position back inside a program that has changed shape.
 *
 * Deriving the program means it can get shorter while the lifter is
 * standing in it — dropping from five days a week to three, or from an
 * eight-week block to six. The position then points past the end, and the
 * Train screen would show nothing at all.
 *
 * Clamping rather than resetting: being moved from Friday to Wednesday is
 * a small surprise, and being sent back to week one is a lost block.
 */
export function clampPosition(
  program: ProgramTemplate,
  position: ProgramPosition,
): ProgramPosition {
  const blockIndex = Math.min(position.blockIndex, Math.max(0, program.blocks.length - 1))
  const block = program.blocks[blockIndex]
  if (block === undefined) return position

  const weekIndex = Math.min(position.weekIndex, Math.max(0, block.weeks.length - 1))
  const week = block.weeks[weekIndex]
  if (week === undefined) return position

  const dayIndex = Math.min(position.dayIndex, Math.max(0, week.days.length - 1))

  return { ...position, blockIndex, weekIndex, dayIndex }
}
