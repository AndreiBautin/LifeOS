import { useQuery } from '@tanstack/react-query'

import { useServices, useSettings } from '@/app/context'
import { resultOf, type DailyOutcome } from '@/application/use-cases/daily/once-a-day'
import { sweepIfDue } from '@/application/use-cases/jobs/daily-sweep'
import type { LeadSweep } from '@/application/use-cases/jobs/leads'

/**
 * The morning read of the boards, run on whichever screen asks first.
 *
 * A query rather than an effect, so the result is shared: Today and the
 * Jobs screen both want it, and two effects would read every board
 * twice. The gate is idempotent within a day anyway, and now *remembers*
 * — so the answer survives a reload rather than only a navigation.
 *
 * **Never retried and never refetched.** The defaults would re-read
 * three job boards on every window focus, which is the polling this
 * whole area is written to avoid; and a sweep that failed has already
 * marked the day, so a retry would read the boards again for a result
 * the gate says was already attempted.
 */
export const DAILY_SWEEP = ['jobs', 'daily-sweep'] as const

export function useDailySweep() {
  const services = useServices()
  const { settings } = useSettings()

  return useQuery<DailyOutcome<LeadSweep>>({
    queryKey: DAILY_SWEEP,
    queryFn: () => sweepIfDue(settings.jobSearch, services),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  })
}

/** This morning's sweep, whether this render is the one that fetched it. */
export function useMorningLeads(): LeadSweep | undefined {
  return resultOf(useDailySweep().data)
}
