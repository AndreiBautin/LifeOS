import type { Exercise } from './exercise'

/**
 * The exercise library, derived rather than stored.
 *
 * The same decision as the program, for the same reason and after the
 * same failure. A shipped catalogue copied into IndexedDB is a second
 * copy of the app's own reference data, and every change to it then needs
 * a delivery mechanism. Three accumulated here — seed on first run, an
 * additive sync for exercises that shipped later, and an explicit
 * retirement list for exercises withdrawn — and between them they still
 * could not deliver the one thing most likely to change: an edit to an
 * exercise that already exists. Widening a rep range reached the code and
 * not the device, which is precisely the bug the program derivation was
 * introduced to end.
 *
 * So the catalogue is read at every use and the store holds only what the
 * catalogue cannot know:
 *
 *   - **A lifter's own exercise** (`isBuiltIn: false`) — theirs, kept.
 *   - **A retired built-in** — one that shipped once and has since been
 *     withdrawn. Kept, but archived, because a workout logged months ago
 *     still references it and history that resolves to "Unknown exercise"
 *     is worse than a movement that can no longer be programmed.
 *
 * A stored built-in the catalogue still contains is simply shadowed. It
 * needs no migration and no cleanup — nothing reads it.
 */
export function resolveLibrary(
  builtIns: readonly Exercise[],
  stored: readonly Exercise[],
): readonly Exercise[] {
  const shipped = new Set(builtIns.map((exercise) => exercise.id as string))

  const kept = stored
    .filter((exercise) => !shipped.has(exercise.id as string))
    .map((exercise) =>
      /*
       * Archived by construction, not by a list somebody has to remember
       * to update. An exercise leaving the catalogue *is* its retirement;
       * there is no second step that can be skipped.
       */
      exercise.isBuiltIn ? { ...exercise, isArchived: true } : exercise,
    )

  return [...builtIns, ...kept]
}
