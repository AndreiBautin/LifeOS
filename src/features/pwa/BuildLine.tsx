import { useState } from 'react'

import { Button } from '@/components/shared/primitives'
import { logger } from '@/shared/logging/logger'

/**
 * Which build is running, and a way to go and get a newer one.
 *
 * **There was already a version line and it said "Lift".** The app was
 * renamed and this one footer was missed, so the one place that could
 * have answered "which build am I on" was labelled with a name that had
 * not existed for months — which is worse than nothing, because it reads
 * as a different app. It sat below the fold at the end of Settings with
 * no way to act on it.
 *
 * `VITE_COMMIT_SHA` was already being injected by the deploy, so there
 * is no second mechanism for this: a `define` added here would have been
 * a duplicate of a variable that has worked all along.
 *
 * The button is deliberately a second route to something that is already
 * supposed to be automatic. The banner asks, and a waiting worker is now
 * applied at launch, and if either of those fails there has to be
 * something a person can press — an update path with no manual override
 * is one you cannot debug from the far end of a phone call.
 *
 * It says what happened in words rather than spinning: "already the
 * newest" is the answer that was impossible to get before, and it is the
 * one that distinguishes a device that will not update from a deploy
 * that did not happen.
 */
type Check = 'idle' | 'checking' | 'current' | 'updating' | 'unsupported' | 'failed'

const MESSAGES: Record<Check, string | undefined> = {
  idle: undefined,
  checking: 'Checking…',
  current: 'Already the newest.',
  updating: 'New version found — reloading.',
  unsupported: 'No service worker here, so nothing is cached.',
  failed: 'Could not check. You may be offline.',
}

export function BuildLine() {
  const [state, setState] = useState<Check>('idle')

  const check = async (): Promise<void> => {
    if (!('serviceWorker' in navigator)) {
      setState('unsupported')
      return
    }

    setState('checking')

    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration === undefined) {
        setState('unsupported')
        return
      }

      await registration.update()

      /*
       * `update()` resolves once the check is done, not once a new worker
       * has installed, so the worker may still be arriving. `waiting` is
       * the one that is ready to take over; `installing` becomes that in
       * a moment, and waiting on its state change is what turns "nothing
       * found" into the truth.
       */
      const pending = registration.waiting ?? registration.installing
      if (pending === null) {
        setState('current')
        return
      }

      setState('updating')
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.location.reload()
        },
        { once: true },
      )

      if (registration.waiting !== null) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        return
      }

      pending.addEventListener('statechange', () => {
        if (pending.state === 'installed') pending.postMessage({ type: 'SKIP_WAITING' })
      })
    } catch (error: unknown) {
      logger.debug('sw.manual-check-failed', { message: String(error) })
      setState('failed')
    }
  }

  return (
    <div className="mb-8 flex flex-col items-center gap-1">
      <div className="flex items-center gap-3">
        <span className="text-ink-700 numeric text-xs">
          LifeOS {import.meta.env.VITE_APP_VERSION ?? 'dev'}
          {import.meta.env.VITE_COMMIT_SHA !== undefined &&
            ` · ${import.meta.env.VITE_COMMIT_SHA.slice(0, 7)}`}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={state === 'checking'}
          onClick={() => {
            void check()
          }}
        >
          Check for updates
        </Button>
      </div>
      {MESSAGES[state] !== undefined && <p className="text-ink-700 text-xs">{MESSAGES[state]}</p>}
    </div>
  )
}
