/**
 * The colours a session's exercises wear, in the order they were done,
 * shared by the timeline and the replay so one exercise is one colour on
 * the session page. Warm-ups are ink.
 */
export const TIMELINE_COLOURS = [
  'var(--color-accent-400)',
  'var(--color-cool-500)',
  'var(--color-warn-500)',
  'var(--color-good-500)',
] as const

export const WARMUP_COLOUR = 'var(--color-ink-500)'

/** Colour per entry index, given which entries appear and whether each is a warm-up. */
export function coloursFor(
  entries: readonly { readonly index: number; readonly warmup: boolean }[],
): ReadonlyMap<number, string> {
  let next = 0
  return new Map(
    entries.map(({ index, warmup }) => [
      index,
      warmup ? WARMUP_COLOUR : (TIMELINE_COLOURS[next++ % TIMELINE_COLOURS.length] ?? ''),
    ]),
  )
}
