import { useQuery } from '@tanstack/react-query'

import { useServices, useSettings } from '@/app/context'
import { resultOf, type DailyOutcome } from '@/application/use-cases/daily/once-a-day'
import { readDigestIfDue, type Digest } from '@/application/use-cases/news/digest'

/**
 * This morning's digest, read once and shared by whatever asks.
 *
 * Every refetch is off, and here it matters more than anywhere else in
 * the app: the defaults would re-read two news APIs on every window
 * focus, which is precisely the polling loop that turns a digest into a
 * feed. The gate would decline the work anyway — it is idempotent within
 * a day — but a query that keeps asking is a query somebody will
 * eventually loosen the gate for.
 */
export const DIGEST = ['news', 'digest'] as const

export function useDigestRun() {
  const services = useServices()
  const { settings } = useSettings()

  return useQuery<DailyOutcome<Digest>>({
    queryKey: DIGEST,
    queryFn: () => readDigestIfDue(settings.digest, services),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  })
}

/** The digest itself, whether this render fetched it or remembered it. */
export function useDigest(): Digest | undefined {
  return resultOf(useDigestRun().data)
}
