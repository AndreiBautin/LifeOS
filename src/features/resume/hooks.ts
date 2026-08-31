import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '@/app/context'
import {
  addRole,
  getResume,
  removeRole,
  saveResume,
  type NewRole,
} from '@/application/use-cases/resume/resume'
import type { Resume } from '@/domain/resume/resume'
import { logger } from '@/shared/logging/logger'

const RESUME = ['resume'] as const

export function useResume() {
  const services = useServices()

  return useQuery({ queryKey: RESUME, queryFn: () => getResume(services) })
}

function useResumeMutation<TArgs>(what: string, run: (args: TArgs) => Promise<unknown>) {
  const client = useQueryClient()

  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: RESUME })
    },
    onError: (error: unknown) => {
      logger.error('resume.mutation-failed', { what, message: String(error) })
    },
  })
}

export function useSaveResume() {
  const services = useServices()

  return useResumeMutation<Resume>('save', (resume) => saveResume(resume, services))
}

export function useAddRole() {
  const services = useServices()

  return useResumeMutation<NewRole>('add-role', (input) => addRole(input, services))
}

export function useRemoveRole() {
  const services = useServices()

  return useResumeMutation<string>('remove-role', (id) => removeRole(id, services))
}
