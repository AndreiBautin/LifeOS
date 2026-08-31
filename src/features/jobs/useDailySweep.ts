import { useQuery } from '@tanstack/react-query'

import { useServices, useSettings } from '@/app/context'
import { sweepIfDue, type DailySweepOutcome } from '@/application/use-cases/jobs/daily-sweep'

/**
 * The morning read of the boards, run on whichever screen asks first.
 *
 * A query rather than an effect, so the result is shared: Today and the
 * Jobs screen both want it, and two effects would read every board
 * twice. `sweepIfDue` is idempotent within a day anyway — the marker
 * makes the second call a no-op — but sharing the answer is what stops
 * the two screens disagreeing about how many leads there are.
 *
 * **Never retried and never refetched.** The defaults would re-read
 * three job boards on every window focus, which is the polling this
 * whole area is written to avoid; and a sweep that failed has already
 * marked the day, so a retry would read the boards again for a result
 * the marker says was already taken.
 */
export const DAILY_SWEEP = ['jobs', 'daily-sweep'] as const

export function useDailySweep() {
  const services = useServices()
  const { settings } = useSettings()

  return useQuery<DailySweepOutcome>({
    queryKey: DAILY_SWEEP,
    queryFn: () => sweepIfDue(settings.jobSearch, services),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  })
}
