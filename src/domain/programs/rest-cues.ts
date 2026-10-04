/** A sound the rest timer makes: a tick in the last seconds, a chime at the end. */
export type RestCue = 'tick' | 'done'

/** The seconds left at which a tick sounds. */
export const TICK_AT = [3, 2, 1] as const

/**
 * Which cues sound between two readings of the time left, in milliseconds.
 *
 * **By crossing, not by equality**, because the timer reads the wall clock
 * every quarter second and a tab suspended in a pocket can jump straight
 * from forty seconds to nothing — so a reading never lands exactly on
 * 3,000. A jump over several marks sounds only the end: three ticks and a
 * chime fired together on unlocking a phone are noise, not a countdown.
 * Time added (+30s) moves `now` above `before`, which crosses nothing.
 */
export function restCuesBetween(before: number, now: number): readonly RestCue[] {
  if (now >= before) return []
  if (before > 0 && now <= 0) return ['done']
  const ticks = TICK_AT.filter((mark) => before > mark * 1000 && now <= mark * 1000)
  return ticks.length === 1 ? ['tick'] : []
}
