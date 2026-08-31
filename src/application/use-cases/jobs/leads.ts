import type { AtsProvider, FetchedPosting } from '@/domain/jobs/boards'
import { PROVIDER_LABELS, UnknownBoard } from '@/domain/jobs/boards'
import { scorePosting, type Scored, type SearchProfile } from '@/domain/jobs/score'
import type { Clock, JobBoardGateway } from '@/domain/repositories/ports'

export interface LeadDeps {
  readonly boards: JobBoardGateway
  readonly clock: Clock
}

export interface BoardSource {
  readonly provider: AtsProvider
  readonly token: string
}

export interface Lead {
  readonly posting: FetchedPosting
  readonly scored: Scored
}

export interface LeadSweep {
  /** Everything that cleared the bar, best first. */
  readonly leads: readonly Lead[]
  /** How many postings were read in total, before any judging. */
  readonly read: number
  /** Boards that could not be read, and why. Named rather than swallowed. */
  readonly failures: readonly { readonly source: BoardSource; readonly reason: string }[]
}

/**
 * Reads every board and keeps what a profile would call a lead.
 *
 * **One board failing must not lose the others.** A typo'd token is the
 * commonest thing that goes wrong here, and a sweep that threw on the
 * first bad one would report nothing at all and blame the network. Each
 * board is read on its own and its failure is reported by name.
 *
 * Sequential rather than parallel, deliberately. These are free services
 * run for employers rather than for us; a dozen simultaneous requests
 * from every device that opens the screen is how a free API stops being
 * one. The same reason the map's geocoder debounces.
 */
export async function sweepBoards(
  sources: readonly BoardSource[],
  profile: SearchProfile,
  minimumScore: number,
  deps: LeadDeps,
): Promise<LeadSweep> {
  const now = deps.clock.now()
  const leads: Lead[] = []
  const failures: { source: BoardSource; reason: string }[] = []
  let read = 0

  for (const source of sources) {
    let postings: readonly FetchedPosting[]
    try {
      postings = await deps.boards.fetch(source.provider, source.token)
    } catch (error: unknown) {
      failures.push({
        source,
        reason:
          error instanceof UnknownBoard
            ? `No ${PROVIDER_LABELS[source.provider]} board called "${source.token}"`
            : String(error),
      })
      continue
    }

    read += postings.length

    for (const posting of postings) {
      const scored = scorePosting(posting, profile, now)
      /*
       * A rejected posting is dropped rather than kept with a zero. It
       * failed a filter the person set on purpose, and a list that shows
       * what you asked not to see is a list you stop reading.
       */
      if (scored.rejected !== undefined || scored.score < minimumScore) continue

      leads.push({ posting, scored })
    }
  }

  leads.sort(
    (a, b) => b.scored.score - a.scored.score || a.posting.title.localeCompare(b.posting.title),
  )

  return { leads, read, failures }
}

/**
 * How many other openings each employer has in this sweep.
 *
 * Boards post in bulk, so a handful of companies tend to dominate a
 * list — thirty applications quietly going to one place is the failure
 * this exists to make visible before it happens rather than after.
 */
export function countByEmployer(leads: readonly Lead[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()

  for (const lead of leads) {
    const key = lead.posting.boardToken
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return counts
}
