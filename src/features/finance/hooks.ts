import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  listFinance,
  recordFinance,
  type NewFinanceReading,
} from '@/application/use-cases/finance/finance'
import { logger } from '@/shared/logging/logger'

const FINANCE = ['finance'] as const

export function useFinance() {
  const services = useServices()

  return useQuery({ queryKey: [...FINANCE, 'all'], queryFn: () => listFinance(services) })
}

export function useRecordFinance() {
  const services = useServices()
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: NewFinanceReading) => recordFinance(input, services),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: FINANCE })
      /*
       * The character sheet reads the credit ladder from a live
       * measurement, so a score entered here changes a level on another
       * screen immediately. Missing this is how a number updates
       * everywhere except the page somebody is about to look at.
       */
      void client.invalidateQueries({ queryKey: ['character'] })
      /*
       * **And the upgrades, because the surplus banks into the pool.**
       * The pool is derived from these readings and the purchased
       * upgrades, so a surplus recorded here changes what the tech tree
       * says is within reach. Without this the tree keeps the old gates
       * until something else reloads it — the same defect as the line
       * above, one area further out.
       */
      void client.invalidateQueries({ queryKey: ['upgrades'] })
    },
    onError: (error: unknown) => {
      logger.error('finance.record-failed', { message: String(error) })
    },
  })
}
