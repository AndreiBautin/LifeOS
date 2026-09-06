import { useIsFetching, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/shared/primitives'
import { logger } from '@/shared/logging/logger'

/**
 * A read that failed, said out loud.
 *
 * **The defect this exists for is that a failed read and a slow one look
 * identical.** Every card in this app renders a skeleton while
 * `data === undefined`, which is the right shape for loading and is also
 * exactly the state an *errored* query sits in — `retry: false` is a
 * deliberate default, so a query that throws resolves once, keeps
 * `data` undefined, and the screen waits forever.
 *
 * It presented as a hang rather than as a failure. The whole app came up
 * as placeholders on a device that had signed in perfectly well, and
 * nothing anywhere said why.
 *
 * **One banner rather than eighty-nine call sites**, and that is a
 * judgement rather than laziness. Teaching every card to distinguish
 * `isError` from loading is the thorough fix and touches every screen in
 * the app; what a person actually needs is to know that something failed
 * and to be able to try again, which is one component. The cards keep
 * their skeletons — a skeleton beside a banner saying a read failed is
 * no longer a lie.
 *
 * It is deliberately **not** a toast: this state persists until somebody
 * acts on it, where a toast is for something that has already finished
 * happening.
 */

/** How many queries are currently in error, watched without polling. */
function useFailedReads(): number {
  const client = useQueryClient()
  const cache = client.getQueryCache()

  /*
   * `useSyncExternalStore` rather than an effect and a piece of state.
   * The cache is an external store with a subscribe method, which is
   * precisely what this hook is for — and it means the count cannot be
   * read in a render that has already been superseded.
   */
  return useSyncExternalStore(
    (notify) => cache.subscribe(notify),
    () => cache.findAll({ type: 'all' }).filter((query) => query.state.status === 'error').length,
  )
}

function summarise(failed: number): string {
  return `${String(failed)} things could not be loaded.`
}

export function ReadFailure() {
  const client = useQueryClient()
  const failed = useFailedReads()

  /*
   * A retry already in flight is not another failure to report. Without
   * this the banner keeps its "Try again" while the attempt is running,
   * which invites a second press against the same request.
   */
  const fetching = useIsFetching()

  if (failed === 0) return null

  return (
    <div
      role="alert"
      className="border-bad-500/40 bg-ink-900 fixed inset-x-3 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-xl border p-3 shadow-lg"
      style={{ top: 'calc(0.75rem + var(--safe-top))' }}
    >
      <AlertTriangle size={18} className="text-bad-500 shrink-0" aria-hidden />
      <p className="text-ink-100 flex-1 text-sm">
        {/*
          The count, because "something went wrong" is the sentence that
          made this invisible in the first place. One failed read is a
          screen; twenty is the connection or the account.
        */}
        {failed === 1 ? 'Something could not be loaded.' : summarise(failed)}{' '}
        <span className="text-ink-500">Anything still loading below may not arrive.</span>
      </p>
      <Button
        size="sm"
        variant="primary"
        disabled={fetching > 0}
        onClick={() => {
          logger.info('read.retry', { failed })
          /*
           * Only the failed ones. Refetching everything would re-read
           * collections that answered perfectly well, which on Firestore
           * is billed and on a slow connection is the reason the first
           * read failed.
           */
          void client.refetchQueries({
            predicate: (query) => query.state.status === 'error',
          })
        }}
      >
        {fetching > 0 ? 'Trying…' : 'Try again'}
      </Button>
    </div>
  )
}
