import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { logAttempt, practiceLog, unlogAttempt } from '@/application/use-cases/mind/practice'
import type { AttemptId } from '@/domain/ids/ids'
import type { NewAttempt } from '@/domain/mind/practice'
import type { TrackId } from '@/domain/mind/tracks'
import { useXpAward } from '@/app/xp-award'

export const PRACTICE = ['mind', 'practice'] as const

export function usePracticeLog() {
  const services = useServices()

  return useQuery({ queryKey: PRACTICE, queryFn: () => practiceLog(services) })
}

/**
 * A track's exercises, fetched once and kept.
 *
 * `staleTime: Infinity` because a track's exercise list changes about as
 * often as a library reshelves — and unauthenticated GitHub allows sixty
 * requests an hour, which is ample for reading a track once and nowhere
 * near enough to refetch on every focus. The refetch defaults are off for
 * the same reason the digest's are.
 */
export function useTrack(track: TrackId | undefined) {
  const services = useServices()

  return useQuery({
    queryKey: ['mind', 'track', track],
    // Total rather than asserted. `enabled` already stops this running
    // with no track, and both ways of telling the compiler so are
    // forbidden here -- so the function simply answers for the case.
    queryFn: () => (track === undefined ? Promise.resolve([]) : services.tracks.read(track)),
    enabled: track !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  })
}

/**
 * Logging a solved problem, which is an act and says so on screen.
 *
 * The XP badge reads its number from the registry rather than holding a
 * copy — a component that knew "a problem is 20" would be a second
 * answer waiting to disagree with `tallyActs`, both looking
 * authoritative.
 */
export function useLogAttempt() {
  const services = useServices()
  const client = useQueryClient()
  const { award } = useXpAward()

  return useMutation({
    mutationFn: (input: NewAttempt) => logAttempt(input, services),
    onSuccess: (result) => {
      if (result.error !== undefined) return

      award('mind.problem-solved')
      void client.invalidateQueries({ queryKey: PRACTICE })
      void client.invalidateQueries({ queryKey: ['character'] })
      void client.invalidateQueries({ queryKey: ['review'] })
    },
  })
}

/**
 * Removing one, which pays nothing back.
 *
 * Undo pays nothing anywhere in this app — not a negative badge and not
 * a silent one. It takes the record away and the sheet shows that at the
 * next read.
 */
export function useUnlogAttempt() {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (id: AttemptId) => unlogAttempt(id, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: PRACTICE })
      void client.invalidateQueries({ queryKey: ['character'] })
      void client.invalidateQueries({ queryKey: ['review'] })
    },
  })
}
