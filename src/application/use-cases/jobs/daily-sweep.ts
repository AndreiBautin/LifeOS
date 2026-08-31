import { canSweep, type JobSearch } from '@/domain/jobs/search'
import { toDayKey } from '@/domain/time/day'

import { sweepBoards, type LeadDeps, type LeadSweep } from './leads'

/**
 * Reading the boards once a day, on the first open of that day.
 *
 * **This is not a scheduled job and must not be described as one.** The
 * app has no server and iOS gives a home-screen web app no background
 * fetch, so nothing here can run while the app is closed — the same
 * ceiling that stops a daily from ringing. What is actually available is
 * a sweep that happens when you next open the app, which on something
 * opened every morning is most of the way to the same thing. The screen
 * says "checked this morning", never "checking hourly".
 *
 * **Once per day per device, and the day key is local.** A device that
 * has already swept today does nothing, so opening the app six times
 * costs one read of each board rather than six. Two devices sweep twice,
 * which is accepted: the alternative is syncing the marker, and a
 * marker that travels means the phone skips its sweep because the laptop
 * ran one an hour ago — leaving the phone with nothing to show and no
 * way to explain why.
 *
 * The restraint is the same one the geocoder shows towards Nominatim.
 * These are free services run for employers rather than for us, and the
 * budget being spent here is a handful of requests each morning.
 */

export interface SweepMarker {
  /** The local day key of the last automatic sweep. */
  readonly sweptOn?: string
}

export interface SweepMarkerStore {
  get(): SweepMarker
  save(marker: SweepMarker): void
}

export interface DailySweepDeps extends LeadDeps {
  readonly sweepMarker: SweepMarkerStore
}

export type DailySweepOutcome =
  /** Ran, and this is what came back. */
  | { readonly kind: 'swept'; readonly sweep: LeadSweep; readonly on: string }
  /** Already read the boards today; nothing was requested. */
  | { readonly kind: 'already-swept'; readonly on: string }
  /** No boards configured, so there is nothing to read. */
  | { readonly kind: 'nothing-to-read' }

/**
 * Sweeps if today's sweep has not happened yet.
 *
 * **The marker is written before the boards are read, not after.** A
 * board that times out would otherwise leave the marker unset, and every
 * subsequent open of the app that day would try the whole list again —
 * turning one slow morning into a request loop against somebody else's
 * free API. A failed sweep is reported in `failures` and shown; the
 * button beside it is how a person retries, which is a decision rather
 * than a retry storm.
 */
export async function sweepIfDue(
  search: JobSearch,
  deps: DailySweepDeps,
): Promise<DailySweepOutcome> {
  if (!canSweep(search)) return { kind: 'nothing-to-read' }

  const today = toDayKey(deps.clock.now())
  const { sweptOn } = deps.sweepMarker.get()

  if (sweptOn === today) return { kind: 'already-swept', on: today }

  deps.sweepMarker.save({ sweptOn: today })

  const sweep = await sweepBoards(search.sources, search.profile, search.minimumScore, deps)

  return { kind: 'swept', sweep, on: today }
}
