/**
 * Keeps a skipped screen transition from surfacing as an error.
 *
 * A view transition is skipped whenever a second navigation starts before
 * the first has finished animating, or when the page is hidden. The
 * browser then rejects the transition's `ready` promise with an
 * `AbortError` — and React Router, which starts the transition, only
 * awaits `finished`. The rejection goes unhandled and prints as an
 * uncaught error for something that is not a fault: the navigation itself
 * still happened, one frame sooner.
 *
 * Wrapping the method once is the only place this can be answered for
 * every link; nothing about which transitions run changes.
 */
export function quietSkippedTransitions(): void {
  if (typeof document.startViewTransition !== 'function') return
  const start = document.startViewTransition.bind(document)

  document.startViewTransition = ((...args: Parameters<typeof start>) => {
    const transition = start(...args)
    transition.ready.catch(() => undefined)
    transition.updateCallbackDone.catch(() => undefined)
    transition.finished.catch(() => undefined)
    return transition
  }) as typeof document.startViewTransition
}
