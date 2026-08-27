import { useQuery } from '@tanstack/react-query'

import { useServices } from '@/app/context'
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
