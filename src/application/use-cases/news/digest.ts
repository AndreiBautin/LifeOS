import { canRead, rankDigest, type DigestPreferences, type RankedStory } from '@/domain/news/digest'
import { SOURCE_LABELS, type NewsSource, type Story } from '@/domain/news/story'
import type { Clock, NewsGateway } from '@/domain/repositories/ports'

import { onceADay, type DailyOutcome, type DailyRunStore } from '../daily/once-a-day'

/**
 * This morning's reading, from the sources you follow.
 *
 * **Read one source at a time, and only on the first open of a day.**
 * These are free services run for other people; the same restraint the
 * job boards and the map's geocoder show. A digest that refreshed on
 * every window focus would be a feed with a polling loop attached, which
 * is the thing this feature has to stay the right side of.
 *
 * **A source that fails is named and the rest continue**, the rule the
 * board sweep already follows. One service being down should not empty
 * the digest and leave somebody blaming their filters.
 */

export interface DigestDeps {
  readonly news: NewsGateway
  readonly clock: Clock
  readonly digestStore: DailyRunStore<Digest>
}

export interface Digest {
  readonly stories: readonly RankedStory[]
  /** How many were read before ranking and cutting, for the one honest line. */
  readonly read: number
  readonly failures: readonly { readonly source: NewsSource; readonly reason: string }[]
}

export async function readDigest(
  preferences: DigestPreferences,
  deps: DigestDeps,
): Promise<Digest> {
  const collected: Story[] = []
  const failures: { source: NewsSource; reason: string }[] = []

  for (const source of preferences.sources) {
    try {
      collected.push(...(await deps.news.read(source)))
    } catch (error: unknown) {
      failures.push({
        source,
        reason: `${SOURCE_LABELS[source]} could not be read`,
      })
      // Kept for the log rather than the screen: a raw fetch error is
      // not a sentence anybody can act on.
      void error
    }
  }

  return { stories: rankDigest(collected, preferences), read: collected.length, failures }
}

/**
 * The digest, read once a day and remembered for the rest of it.
 *
 * The gate is shared with the job sweep — see `once-a-day.ts`, and in
 * particular why the day is marked *before* the work.
 */
export function readDigestIfDue(
  preferences: DigestPreferences,
  deps: DigestDeps,
): Promise<DailyOutcome<Digest>> {
  return onceADay(canRead(preferences), { store: deps.digestStore, clock: deps.clock }, () =>
    readDigest(preferences, deps),
  )
}

/**
 * The links already in the Codex, so a digest can say which are spent.
 *
 * The same shape as `appliedLinks` for job leads, and it exists for the
 * same reason: the digest is re-read every morning and a story can
 * appear on the front page for two days running, so without this the
 * card quietly invites the same article to be saved twice. Component
 * state is not enough — it resets on reload, and the second save would
 * be a duplicate with a different id that nothing could merge.
 *
 * Matched on the stored link rather than the title, because a title is
 * edited and a link is not.
 */
export async function savedLinks(deps: {
  readonly items: { all(): Promise<readonly { readonly notes?: string }[]> }
}): Promise<ReadonlySet<string>> {
  const items = await deps.items.all()

  return new Set(
    items
      .map((item) => item.notes?.trim())
      .filter((link): link is string => link !== undefined && link !== ''),
  )
}
