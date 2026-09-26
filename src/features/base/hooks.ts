import { useQuery } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { houseClutter } from '@/application/use-cases/base/declutter'

/**
 * Split out of `Declutter.tsx` so `BaseGlance` can read the same query —
 * a hook and a component in one file breaks Fast Refresh, the reason
 * `styles.ts` and `count-labels.ts` both exist for the same split
 * elsewhere in this app.
 */
export const CLUTTER = ['base', 'clutter'] as const

export function useHouse() {
  const services = useServices()

  return useQuery({ queryKey: CLUTTER, queryFn: () => houseClutter(services) })
}
