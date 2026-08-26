import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServices } from '@/app/context'
import {
  addUpgrade,
  deleteUpgrade,
  updateUpgrade,
  upgradeTree,
  type NewUpgrade,
  type UpgradeChanges,
  type UpgradeResult,
} from '@/application/use-cases/upgrades/upgrades'
import {
  readUpgradeBudget,
  writeUpgradeBudget,
} from '@/infrastructure/storage/upgrade-budget-store'
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

export function useUpgradeTree(availableMinorUnits: number) {
  const services = useServices()

  return useQuery({
    queryKey: [...UPGRADES, 'tree', availableMinorUnits],
    queryFn: () => upgradeTree(availableMinorUnits, services),
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

export function useDeleteUpgrade() {
  return useUpgradeMutation<UpgradeId, { readonly error?: string }>(
    'upgrades.delete',
    (id, services) => deleteUpgrade(id, services),
  )
}

/** What you have to spend right now — device-local, never synced. */
export function useBudget(): readonly [number, (minorUnits: number) => void] {
  const [budget, setBudget] = useState(readUpgradeBudget)

  return [
    budget,
    (minorUnits: number) => {
      setBudget(minorUnits)
      writeUpgradeBudget(minorUnits)
    },
  ]
}
