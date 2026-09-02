import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { useXpAward } from '@/app/xp-award'
import {
  addChallenge,
  completeChallenge,
  hideChallenge,
  readChallenges,
  uncompleteChallenge,
} from '@/application/use-cases/challenges/challenges'
import { logger } from '@/shared/logging/logger'

const CHALLENGES = ['challenges'] as const

export function useChallenges() {
  const services = useServices()

  return useQuery({
    queryKey: [...CHALLENGES, 'season'],
    queryFn: () => readChallenges(services),
  })
}

/**
 * Every mutation reloads the pass and the sheet.
 *
 * **`['character']` covers the season too**, because the season query
 * is keyed `['character', 'season']` and invalidation matches by
 * prefix. That is worth stating rather than adding a second line that
 * looks load-bearing and does nothing: a challenge pays XP, and the
 * season bar sits directly under the pass counting this season's XP, so
 * the two must never disagree on one screen — which is the defect the
 * finance pool shipped with.
 */
function useChallengeMutation<TVariables>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<void>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<unknown, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: CHALLENGES })
      void client.invalidateQueries({ queryKey: ['character'] })
    },
  })
}

/**
 * Ticking one, which announces the XP.
 *
 * The badge reads its figure from the registry by act id, so it can
 * never announce a number `tallyActs` will not agree with — the coupling
 * `registry.test.ts` holds.
 */
export function useCompleteChallenge() {
  const { award } = useXpAward()
  const mutation = useChallengeMutation<string>('challenges.completed', (id, services) =>
    completeChallenge(id, services),
  )

  return {
    ...mutation,
    complete: (id: string) => {
      mutation.mutate(id, {
        onSuccess: () => {
          award('challenges.completed')
        },
      })
    },
  }
}

/** Unticking, which pays nothing back — undo never does here. */
export function useUncompleteChallenge() {
  return useChallengeMutation<string>('challenges.uncompleted', (id, services) =>
    uncompleteChallenge(id, services),
  )
}

export function useAddChallenge() {
  return useChallengeMutation<string>('challenges.added', (title, services) =>
    addChallenge(title, services),
  )
}

export function useHideChallenge() {
  return useChallengeMutation<string>('challenges.hidden', (id, services) =>
    hideChallenge(id, services),
  )
}
