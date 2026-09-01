import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices, useSettings } from '@/app/context'
import {
  addVice,
  clearWeighIn,
  editVice,
  listVices,
  listWeighIns,
  recordWeighIn,
  removeVice,
  retireVice,
  spendVice,
  undoVice,
  vitalsToday,
  type NewVice,
} from '@/application/use-cases/vitals/vitals'
import type { ViceId } from '@/domain/ids/ids'
import { logger } from '@/shared/logging/logger'

/**
 * Vitals, from the UI's side.
 *
 * Everything invalidates `['today']` as well as `['vitals']`: the two
 * bars live on Today, so a spend made on the Vitals screen has to reach
 * the card the user will look at next. `['character']` is deliberately
 * **not** invalidated — this area pays no XP, so nothing on the sheet
 * moves when a charge is spent.
 */
const KEYS = [['vitals'], ['today']] as const

function useInvalidating<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>, what: string) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      for (const key of KEYS) void client.invalidateQueries({ queryKey: key })
    },
    onError: (error: unknown) => {
      logger.error('vitals.mutation-failed', { what, message: String(error) })
    },
  })
}

export function useVitalsToday() {
  const services = useServices()
  const { settings } = useSettings()

  /*
   * The settings go **in the key**, the same way `useProgram` carries
   * them, because this read model is derived from them: the phase and
   * the target band reach it through `vitalsToday`. The stated intake
   * did too, until the day figures were scrapped.
   *
   * Invalidating by hand on every settings write is the alternative and
   * is the version that goes wrong. It did, here, and it looked exactly
   * like the fatigue percent that was decorative for two commits — the
   * intake field wrote a real value, the phase text updated because it
   * reads settings directly, and the macro targets went on being derived
   * from the previous number. A control that appears to work and decides
   * nothing is worse than one that is obviously missing.
   */
  return useQuery({
    queryKey: ['today', 'vitals', settings],
    queryFn: () => vitalsToday(services),
  })
}

export function useVices() {
  const services = useServices()

  return useQuery({ queryKey: ['vitals', 'vices'], queryFn: () => listVices(services) })
}

export function useWeighIns() {
  const services = useServices()

  return useQuery({ queryKey: ['vitals', 'weigh-ins'], queryFn: () => listWeighIns(services) })
}

export function useAddVice() {
  const services = useServices()

  return useInvalidating((input: NewVice) => addVice(input, services), 'add-vice')
}

export function useEditVice() {
  const services = useServices()

  return useInvalidating(
    ({ id, input }: { id: ViceId; input: NewVice }) => editVice(id, input, services),
    'edit-vice',
  )
}

export function useSpendVice() {
  const services = useServices()

  return useInvalidating(
    ({ id, amount }: { id: ViceId; amount?: number }) => spendVice(id, services, amount ?? 1),
    'spend-vice',
  )
}

export function useUndoVice() {
  const services = useServices()

  return useInvalidating((id: ViceId) => undoVice(id, services), 'undo-vice')
}

export function useRetireVice() {
  const services = useServices()

  return useInvalidating((id: ViceId) => retireVice(id, services), 'retire-vice')
}

export function useRemoveVice() {
  const services = useServices()

  return useInvalidating((id: ViceId) => removeVice(id, services), 'remove-vice')
}

export function useRecordWeighIn() {
  const services = useServices()

  return useInvalidating((weight: number) => recordWeighIn(weight, services), 'record-weigh-in')
}

export function useClearWeighIn() {
  const services = useServices()

  return useInvalidating((day: string) => clearWeighIn(day, services), 'clear-weigh-in')
}
