import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  draftReview,
  readout,
  retireMetric,
  saveMetric,
  saveReview,
} from '@/application/use-cases/review/review'
import {
  addFriend,
  logHangoutFor,
  removeFriend,
  socialSummary,
} from '@/application/use-cases/social/social'
import type { FriendId, MetricId } from '@/domain/ids/ids'
import type { MetricDefinition } from '@/domain/review/metric'
import { logger } from '@/shared/logging/logger'

/**
 * The review and the circle, from the UI's side.
 *
 * Both invalidate `['review']` on every write, and social writes do too:
 * the active circle is one of the measured metrics, so seeing somebody
 * moves a number on the areas screen. A narrower key here would leave that
 * screen quietly a month out of date.
 */

const REVIEW = ['review'] as const

export function useReadout() {
  const services = useServices()

  return useQuery({ queryKey: [...REVIEW, 'readout'], queryFn: () => readout(services) })
}

export function useReviewDraft() {
  const services = useServices()

  return useQuery({ queryKey: [...REVIEW, 'draft'], queryFn: () => draftReview(services) })
}

export function useSocialSummary() {
  const services = useServices()

  return useQuery({ queryKey: [...REVIEW, 'social'], queryFn: () => socialSummary(services) })
}

function useReviewMutation<TVariables, TResult>(
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

export function useSaveReview() {
  return useReviewMutation<Readonly<Record<string, number>>, unknown>(
    'review.save',
    (entered, services) => saveReview(entered, services),
  )
}

export function useSaveMetric() {
  return useReviewMutation<MetricDefinition, { readonly error?: string }>(
    'review.metric-saved',
    (metric, services) => saveMetric(metric, services),
  )
}

export function useRetireMetric() {
  return useReviewMutation<MetricId, unknown>('review.metric-retired', (id, services) =>
    retireMetric(id, services),
  )
}

export function useAddFriend() {
  return useReviewMutation<{ name: string; lastHangout: string }, unknown>(
    'social.friend-added',
    (input, services) => addFriend(input.name, input.lastHangout, services),
  )
}

export function useLogHangout() {
  return useReviewMutation<{ id: FriendId; date: string }, unknown>(
    'social.hangout-logged',
    ({ id, date }, services) => logHangoutFor(id, date, services),
  )
}

export function useRemoveFriend() {
  return useReviewMutation<FriendId, unknown>('social.friend-removed', (id, services) =>
    removeFriend(id, services),
  )
}
