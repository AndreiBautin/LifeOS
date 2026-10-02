/**
 * How a logged set compares with the same set last time.
 *
 * Double progression is "beat last time until the top of the range, then
 * add weight", so the one question worth answering the moment a set is
 * filed is whether it did. The session player puts the answer on the row.
 *
 * **Load first, then reps**, because that is the order the method moves
 * them in: a heavier bar is progress whatever the reps did, and at the
 * same bar more reps are. A lighter bar is reported as lighter rather than
 * converted into an estimated max — a set of twelve at 95 and one of eight
 * at 115 are not comparable by any number the lifter would recognise.
 *
 * A missing load on either side is the body alone (a bodyweight set), so
 * two unloaded pull-up sets compare on reps.
 */

export type Versus =
  | { readonly kind: 'heavier'; readonly by: number }
  | { readonly kind: 'more-reps'; readonly by: number }
  | { readonly kind: 'matched' }
  | { readonly kind: 'fewer-reps'; readonly by: number }
  | { readonly kind: 'lighter'; readonly by: number }

export interface Performance {
  readonly load?: number | undefined
  readonly reps?: number | undefined
}

/** Undefined when either side has no reps to compare. */
export function versusLast(now: Performance, last: Performance): Versus | undefined {
  if (now.reps === undefined || last.reps === undefined) return undefined
  const load = now.load ?? 0
  const before = last.load ?? 0
  // Hundredths, so 2.5 and 1.25 plates subtract exactly.
  const loadDelta = Math.round((load - before) * 100) / 100
  if (loadDelta > 0) return { kind: 'heavier', by: loadDelta }
  if (loadDelta < 0) return { kind: 'lighter', by: -loadDelta }
  const repsDelta = now.reps - last.reps
  if (repsDelta > 0) return { kind: 'more-reps', by: repsDelta }
  if (repsDelta < 0) return { kind: 'fewer-reps', by: -repsDelta }
  return { kind: 'matched' }
}

/** Progress is the two kinds the method counts as moving forward. */
export function isProgress(versus: Versus): boolean {
  return versus.kind === 'heavier' || versus.kind === 'more-reps'
}
