import { useQuery } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { seasonProgressFor } from '@/application/use-cases/character/season-progress'
import { characterSheet } from '@/application/use-cases/character/sheet'

/**
 * The whole sheet, in one query.
 *
 * Keyed loosely on purpose: it reads across every store in the hub, so
 * anything that could invalidate it invalidates most of the app anyway.
 */
export function useCharacterSheet() {
  const services = useServices()

  return useQuery({
    queryKey: ['character', 'sheet'],
    queryFn: () => characterSheet(services),
  })
}

/**
 * The current season's progress.
 *
 * Its own query rather than part of the sheet: it is derived from the same
 * records but answers a different question, and a screen showing one
 * without the other should not pay for both.
 */
export function useSeasonProgress() {
  const services = useServices()

  return useQuery({
    queryKey: ['character', 'season'],
    queryFn: () => seasonProgressFor(services),
  })
}
