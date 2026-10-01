import type { HomeFilter } from '@/domain/base/base'
import type { UpgradeShelf } from '@/domain/upgrades/shelf'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addUpgrade,
  moveUpgradeToShelf,
  shelfTree,
  deleteUpgrade,
  updateUpgrade,
  upgradeTree,
  wholeTree,
  type NewUpgrade,
  type UpgradeChanges,
  type UpgradeResult,
} from '@/application/use-cases/upgrades/upgrades'
import type { UpgradeId } from '@/domain/ids/ids'
import { logger } from '@/shared/logging/logger'

/**
 * The tech tree's queries and mutations.
 *
 * Two of the mutations can refuse — a cycle, and a delete with dependents
 * still attached — and both report a message rather than throwing. The
 * screen reads `data.error`, not `error`.
 */

const UPGRADES = ['upgrades'] as const

/**
 * The tree for one shelf.
 *
 * The shelf is in the query key beside the budget, for the reason
 * `home` already is: three screens read this hook and a shared key
 * would have the Gear screen showing the tech tree's ranking until
 * something invalidated it.
 */
export function useShelfTree(shelf: UpgradeShelf, availableMinorUnits: number) {
  const services = useServices()

  return useQuery({
    queryKey: [...UPGRADES, 'shelf', shelf, availableMinorUnits],
    queryFn: () => shelfTree(shelf, availableMinorUnits, services),
  })
}

/**
 * No money gate. Finance is not tracked any more — asked for as _"we aren't
 * tracking how much we have saved or anything anymore"_ — so there is no
 * pool to measure a price against, and every upgrade would otherwise read
 * as unaffordable forever. Passing an unreachable budget leaves the one
 * gate that still means something, a prerequisite, and makes `affordable`
 * read as "nothing stands in the way". The tree's ranking and gate logic
 * are untouched; only what they are measured against changed.
 */
export const NO_BUDGET = Number.MAX_SAFE_INTEGER

export function useWholeTree() {
  const services = useServices()

  return useQuery({
    queryKey: [...UPGRADES, 'whole'],
    queryFn: () => wholeTree(NO_BUDGET, services),
  })
}

export function useUpgradeTree(availableMinorUnits: number, home: HomeFilter = 'own-area') {
  const services = useServices()

  return useQuery({
    queryKey: [...UPGRADES, 'tree', home, availableMinorUnits],
    queryFn: () => upgradeTree(availableMinorUnits, services, home),
  })
}

function useUpgradeMutation<TVariables, TResult>(
  event: string,
  run: (variables: TVariables, services: ReturnType<typeof useServices>) => Promise<TResult>,
) {
  const services = useServices()
  const client = useQueryClient()

  return useMutation<TResult, Error, TVariables>({
    mutationFn: (variables) => run(variables, services),
    onSuccess: () => {
      logger.info(event, {})
      void client.invalidateQueries({ queryKey: UPGRADES })
    },
  })
}

export function useAddUpgrade() {
  return useUpgradeMutation<NewUpgrade, UpgradeResult>('upgrades.add', (input, services) =>
    addUpgrade(input, services),
  )
}

export function useUpdateUpgrade() {
  return useUpgradeMutation<{ id: UpgradeId; changes: UpgradeChanges }, UpgradeResult>(
    'upgrades.update',
    ({ id, changes }, services) => updateUpgrade(id, changes, services),
  )
}

/**
 * Moving an upgrade between the tech tree and Base.
 *
 * Written the day Base was and called by nothing until now, which is why
 * the Upgrades panel there could only ever be empty. Every mutation here
 * invalidates the whole `UPGRADES` prefix, and `useUpgradeTree` carries
 * `home` in its key — so both lists reload from one call and neither can
 * be left showing a row that has moved.
 */
export function useMoveUpgradeToShelf() {
  return useUpgradeMutation<{ id: UpgradeId; shelf: UpgradeShelf }, unknown>(
    'upgrades.moved-shelf',
    ({ id, shelf }, services) => moveUpgradeToShelf(id, shelf, services),
  )
}

export function useDeleteUpgrade() {
  return useUpgradeMutation<UpgradeId, { readonly error?: string }>(
    'upgrades.delete',
    (id, services) => deleteUpgrade(id, services),
  )
}
