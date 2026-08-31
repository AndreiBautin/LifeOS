import type { Clock } from '@/domain/repositories/ports'
import { toDayKey } from '@/domain/time/day'

/**
 * Work that runs on the first open of a day, and is remembered for the
 * rest of it.
 *
 * **Not a schedule, and it must never be described as one.** Nothing
 * here runs while the app is closed: there is no server, and iOS gives a
 * home-screen web app no background fetch — the same ceiling that stops
 * a daily from ringing. What is available is work that happens when you
 * next open the app, which on something opened every morning is most of
 * the way to the same thing.
 *
 * **The result is remembered, and the first version of this forgot to.**
 * The job sweep shipped with a marker and no store, so the second open
 * of a day answered "already swept" carrying nothing — and the card that
 * had shown thirty leads at eight in the morning rendered blank at noon,
 * with the day marked done so it could not run again. A morning's work
 * disappearing and no way to get it back is worse than not having run
 * it. One gate, one store, both users.
 */

export interface DailyRun<T> {
  /** The local day this last ran on. */
  readonly on: string
  /**
   * What it produced, absent when the attempt failed.
   *
   * The two are stored separately in time — `on` is written *before* the
   * work and the result after it — which is what makes a failure
   * distinguishable from a success that returned nothing.
   */
  readonly result?: T
}

export interface DailyRunStore<T> {
  get(): DailyRun<T> | undefined
  save(run: DailyRun<T>): void
}

export type DailyOutcome<T> =
  /** Ran just now; this is what came back. */
  | { readonly kind: 'ran'; readonly result: T; readonly on: string }
  /** Ran earlier today; this is what it found then. */
  | { readonly kind: 'remembered'; readonly result: T; readonly on: string }
  /** Ran earlier today and failed. Nothing to show, and no retry. */
  | { readonly kind: 'failed-earlier'; readonly on: string }
  /** Nothing to do — no sources configured. */
  | { readonly kind: 'nothing-to-do' }

export interface OnceADayDeps<T> {
  readonly store: DailyRunStore<T>
  readonly clock: Clock
}

/**
 * Runs `work` if today's run has not happened, and remembers the answer.
 *
 * **The day is marked before the work, not after.** A source that hangs
 * would otherwise leave the mark unset, and every subsequent open of the
 * app that day would try the whole thing again — turning one slow
 * morning into a request loop against somebody else's free API. The
 * failure is surfaced as `failed-earlier` with a manual control beside
 * it, which makes the retry a decision rather than a storm.
 *
 * `ready` is checked first and does *not* mark the day: adding a source
 * at nine in the morning should not have to wait until tomorrow to be
 * read, for no reason a person could see.
 */
export async function onceADay<T>(
  ready: boolean,
  deps: OnceADayDeps<T>,
  work: () => Promise<T>,
): Promise<DailyOutcome<T>> {
  if (!ready) return { kind: 'nothing-to-do' }

  const today = toDayKey(deps.clock.now())
  const previous = deps.store.get()

  if (previous?.on === today) {
    return previous.result === undefined
      ? { kind: 'failed-earlier', on: today }
      : { kind: 'remembered', result: previous.result, on: today }
  }

  // The mark, before the work. See above.
  deps.store.save({ on: today })

  const result = await work()

  deps.store.save({ on: today, result })

  return { kind: 'ran', result, on: today }
}

/**
 * The result of a daily run, whenever it ran, or nothing.
 *
 * The two outcomes that carry a result are the same to a screen — a
 * digest read this morning is the digest, whether this render is the one
 * that fetched it or not — so every caller would otherwise write the
 * same two-branch check.
 */
export function resultOf<T>(outcome: DailyOutcome<T> | undefined): T | undefined {
  return outcome?.kind === 'ran' || outcome?.kind === 'remembered' ? outcome.result : undefined
}

/** Forgets today's run, so the next call does the work again. */
export function forgetToday<T>(store: DailyRunStore<T>): void {
  store.save({ on: '' })
}
