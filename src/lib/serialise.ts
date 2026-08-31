/**
 * Runs work for one key strictly after the last work for that key.
 *
 * **Two read-modify-writes of one record, fired together, lose one of
 * them.** Both read the same starting state and the second overwrites
 * the first. Disabling the control while a mutation runs avoids the
 * miscount by *dropping* the input instead, which from the user's side
 * is the same defect wearing better clothes.
 *
 * It has now been needed twice, which is why it lives here rather than
 * beside its first caller:
 *
 * - logging backlog progress, where two taps counted as one;
 * - entering a day's figures, where sleep and calories are separate
 *   boxes writing to one row — typed in sequence, the second read the
 *   record before the first had saved and sleep vanished. Found by
 *   driving it, with the suite green.
 *
 * **Written here rather than reached for in the query library.** React
 * Query's `scope` does exactly this and was tried first: it queues
 * correctly and then does not drain when an observer unmounts mid-queue
 * — which a hot reload or a re-render does — and the row goes
 * permanently dead with no error anywhere. A four-line promise chain has
 * no such failure mode.
 *
 * Keyed, so unrelated records still run in parallel.
 */
const chains = new Map<string, Promise<unknown>>()

export function serialise<T>(key: string, work: () => Promise<T>): Promise<T> {
  // `catch` before chaining, so one failure does not poison the key
  // forever — the next attempt gets a fresh start rather than the last
  // rejection.
  const next = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(work)
  chains.set(key, next)
  return next
}
