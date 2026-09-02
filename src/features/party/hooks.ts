import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addFriend,
  logHangoutFor,
  removeFriend,
  socialSummary,
} from '@/application/use-cases/social/social'
import type { FriendId } from '@/domain/ids/ids'
import { logger } from '@/shared/logging/logger'

/**
 * The circle, from the UI's side.
 *
 * **These moved here from the review feature when it was deleted**, and
 * they had always sat oddly there: the file was "the review and the
 * circle", two areas sharing one set of hooks because both wrote to the
 * same query key.
 *
 * They still use `['review']` as that key, and that is deliberate rather
 * than a leftover. **The active circle is one of the measured metrics**,
 * so seeing somebody moves a number the character sheet reads; a narrower
 * key would leave the areas quietly a month out of date. The review
 * screen is gone and the readings it fed are not.
 */
const REVIEW = ['review'] as const

export function useSocialSummary() {
  const services = useServices()

  return useQuery({ queryKey: [...REVIEW, 'social'], queryFn: () => socialSummary(services) })
}

function useSocialMutation<TVariables, TResult>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<TResult>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<TResult, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: REVIEW })
    },
  })
}

export function useAddFriend() {
  return useSocialMutation<{ name: string; lastHangout: string }, unknown>(
    'social.friend-added',
    (input, services) => addFriend(input.name, input.lastHangout, services),
  )
}

export function useLogHangout() {
  return useSocialMutation<{ id: FriendId; date: string }, unknown>(
    'social.hangout-logged',
    ({ id, date }, services) => logHangoutFor(id, date, services),
  )
}

export function useRemoveFriend() {
  return useSocialMutation<FriendId, unknown>('social.friend-removed', (id, services) =>
    removeFriend(id, services),
  )
}
