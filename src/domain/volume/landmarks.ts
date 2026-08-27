import type { MuscleGroup } from '@/domain/exercises/taxonomy'
import { MUSCLE_GROUPS } from '@/domain/exercises/taxonomy'

/**
 * All that is left of RP's volume landmarks.
 *
 * `VolumeLandmarks` held four numbers per muscle — MV, MEV, MAV, MRV —
 * and this file held a fifteen-row table of them, a two-thirds factor
 * converting published total volume into direct-set volume, a clamp
 * bringing the result under what a week could schedule, and a structural
 * floor for the forearms. Targets are now stated rather than derived:
 * sessions a week times sets per session, both settings. See
 * `domain/volume/levels.ts`.
 *
 * The correction most worth carrying forward, for anyone tempted to paste
 * a published table back in: **published landmarks are total volume and
 * this app counts direct sets only**. The two are not interchangeable,
 * and copying a table across asks for about half again as much work as it
 * appears to.
 */

export function emptyVolumeMap(): Record<MuscleGroup, number> {
  return Object.fromEntries(MUSCLE_GROUPS.map((muscle) => [muscle, 0])) as Record<
    MuscleGroup,
    number
  >
}
