import { useQuery } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { seasonProgressFor } from '@/application/use-cases/character/season-progress'
import { avatarFor } from '@/application/use-cases/character/avatar'
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
/**
 * The portrait.
 *
 * Its own query, keyed under `character` so everything that already
 * invalidates the sheet invalidates this too — it is derived from the
 * same tally, and a portrait a level behind the page it sits on would be
 * a bug with no obvious owner.
 */
export function useAvatar() {
  const services = useServices()

  return useQuery({ queryKey: ['character', 'avatar'], queryFn: () => avatarFor(services) })
}

export function useSeasonProgress() {
  const services = useServices()

  return useQuery({
    queryKey: ['character', 'season'],
    queryFn: () => seasonProgressFor(services),
  })
}
