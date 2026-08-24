import { useRouteError } from 'react-router-dom'

import { Button, Card } from '@/components/shared/primitives'
import { logger } from '@/shared/logging/logger'

/**
 * The last line of defence.
 *
 * Shows something recoverable and says nothing about internals — a stack
 * trace on screen tells a lifter nothing and tells anyone looking over
 * their shoulder more than it should. The detail goes to the console
 * through the logger, where a developer can find it.
 *
 * Crucially it offers a route out that is not "reload and hope": the data
 * is intact in IndexedDB regardless of what the UI did, and saying so is
 * the difference between a bug and a panic.
 */
export function RouteError() {
  const error = useRouteError()
  logger.error('route.error', error)

  return (
    <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Card className="w-full">
        <h1 className="text-ink-50 text-lg font-semibold">Something went wrong</h1>
        <p className="text-ink-300 mt-2 text-sm">
          The screen failed to render. Your training data is stored separately and is unaffected.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => {
              window.location.reload()
            }}
          >
            Reload
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              window.location.href = import.meta.env.BASE_URL
            }}
          >
            Start over
          </Button>
        </div>
        {import.meta.env.DEV && error instanceof Error && (
          <pre className="text-ink-500 mt-4 overflow-x-auto text-xs">{error.stack}</pre>
        )}
      </Card>
    </div>
  )
}
