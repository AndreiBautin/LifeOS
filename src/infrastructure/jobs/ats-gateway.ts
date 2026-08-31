import {
  boardUrl,
  readBoard,
  UnknownBoard,
  type AtsProvider,
  type FetchedPosting,
} from '@/domain/jobs/boards'
import type { JobBoardGateway } from '@/domain/repositories/ports'
import { logger } from '@/shared/logging/logger'

/**
 * The three public ATS boards, over the network.
 *
 * The only place in this feature allowed to fetch anything — parsing is
 * pure and lives in `domain/jobs/boards.ts`, so every quirk of every
 * board is testable without the internet.
 *
 * **No key and no proxy, which was verified rather than assumed.**
 * Greenhouse, Lever and Ashby all answered a browser request directly.
 * They are also rate-limited services run for employers rather than for
 * us, so this fetches on demand — when somebody presses a button — and
 * never on a timer.
 */
export function createAtsGateway(): JobBoardGateway {
  return {
    async fetch(provider: AtsProvider, token: string): Promise<readonly FetchedPosting[]> {
      const response = await globalThis.fetch(boardUrl(provider, token))

      /*
       * A 404 is a token that does not exist, which is a typo rather
       * than a fault — Lever answers 200 for the same thing, which is
       * why `readBoard` also decides from the body.
       */
      if (response.status === 404 || response.status === 400) {
        throw new UnknownBoard(provider, token)
      }

      if (!response.ok) {
        throw new Error(`${provider} answered ${String(response.status)} for "${token}"`)
      }

      const body: unknown = await response.json()
      const postings = readBoard(provider, body, token)

      logger.info('jobs.board-read', {
        provider,
        token,
        postings: postings.length,
      })

      return postings
    },
  }
}
