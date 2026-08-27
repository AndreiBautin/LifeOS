import { useQuery } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import { agendaFor } from '@/application/use-cases/today/agenda'

/**
 * The agenda.
 *
 * Reads across four areas, so it invalidates on anything — but it is
 * derived rather than stored, which means a stale read costs a re-render
 * and never a wrong record.
 */
export function useAgenda() {
  const services = useServices()

  return useQuery({ queryKey: ['today', 'agenda'], queryFn: () => agendaFor(services) })
}
