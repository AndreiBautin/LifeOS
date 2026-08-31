import { readDevTo, readHackerNews, type NewsSource, type Story } from '@/domain/news/story'
import type { NewsGateway } from '@/domain/repositories/ports'

/**
 * The only thing that fetches news. Everything that *reads* it is pure.
 *
 * **Both endpoints were tested from a browser before any of this was
 * written**, which is the standing rule here after an earlier answer in
 * this project claimed job discovery needed a proxy and was wrong. Both
 * answer a browser request directly, with no key and no account:
 * Hacker News through Algolia's search API, and DEV through its public
 * articles endpoint. Lobsters was tried and is reachable but sends no
 * CORS header, so it is not an option; Exercism's API did not respond to
 * a browser at all.
 *
 * That makes six outbound hosts now — OpenStreetMap for tiles, Nominatim
 * for geocoding, Firebase when sync is configured, the three ATS boards,
 * and these two. **Each one is a decision, not a precedent.**
 */

/**
 * Algolia rather than the official Firebase API, and the reason is
 * request count.
 *
 * `hacker-news.firebaseio.com` returns 500 story *ids* and then wants a
 * request per story to turn them into titles — thirty requests for a
 * front page. This returns the whole thing in one. Both are open; only
 * one is polite.
 */
const HACKER_NEWS = 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30'

/**
 * `top=7` is DEV's own "best of the last week", not a raw firehose.
 *
 * A digest wants what was worth reading, and the default ordering is
 * newest-first, which on a site with this much volume is close to
 * random.
 */
const DEV_TO = 'https://dev.to/api/articles?per_page=30&top=7'

export function createNewsGateway(): NewsGateway {
  return {
    async read(source: NewsSource): Promise<readonly Story[]> {
      const url = source === 'hacker-news' ? HACKER_NEWS : DEV_TO

      const response = await fetch(url, { headers: { accept: 'application/json' } })

      /*
       * Thrown rather than returned empty. A source that is down and a
       * source with nothing to say look identical from an empty list,
       * and only one of them is worth telling somebody about — the
       * digest names its failures for the same reason the board sweep
       * does.
       */
      if (!response.ok) {
        throw new Error(`${source} answered ${String(response.status)}`)
      }

      const payload: unknown = await response.json()

      return source === 'hacker-news' ? readHackerNews(payload) : readDevTo(payload)
    },
  }
}
