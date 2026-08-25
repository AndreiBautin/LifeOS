import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'

import type { AthleteState } from '@/domain/resolution/resolve'
import type { AppSettings } from '@/domain/settings/settings'
import { readSettings, writeSettings } from '@/infrastructure/storage/settings-store'
import { logger } from '@/shared/logging/logger'

import { ServicesContext, SettingsContext, type SettingsContextValue } from './context'
import type { AppServices } from './di'

/**
 * Wiring the composition root into React.
 *
 * Components resolve what they need from context rather than importing a
 * repository directly, so the layer rule holds at runtime as well as at
 * lint time: no component can reach past the application layer to a
 * database, because it has no way to name one.
 */

/**
 * There is no server, so nothing can go stale behind the app's back.
 * Refetching on window focus would be pure waste, and refetching mid-set
 * is actively unhelpful.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

interface Props {
  readonly services: AppServices
  readonly children: ReactNode
}

export function AppProviders({ services, children }: Props) {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const result = readSettings()
    if (result.warning !== undefined) {
      logger.warn('settings.recovered', { recovered: result.recovered })
    }
    return result.settings
  })

  const value = useMemo<SettingsContextValue>(() => {
    const athlete: AthleteState = {
      estimatedMaxes: settings.estimatedMaxes,
      ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
      units: settings.units,
    }

    return {
      settings,
      athlete,
      update: (change) => {
        setSettings((current) => {
          const next = { ...current, ...change }
          if (!writeSettings(next)) {
            logger.warn('settings.write-failed')
          }
          return next
        })
      },
    }
  }, [settings])

  return (
    <QueryClientProvider client={queryClient}>
      <ServicesContext value={services}>
        <SettingsContext value={value}>{children}</SettingsContext>
      </ServicesContext>
    </QueryClientProvider>
  )
}
