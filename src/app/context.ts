import { createContext, use } from 'react'

import type { AthleteState } from '@/domain/resolution/resolve'
import type { AppSettings } from '@/domain/settings/settings'

import type { AppServices } from './di'

/**
 * The contexts, kept apart from the provider component.
 *
 * A file exporting both a component and a hook breaks React Fast Refresh,
 * so the split is what keeps editing a screen from reloading the whole
 * app mid-session.
 */

export const ServicesContext = createContext<AppServices | undefined>(undefined)

export function useServices(): AppServices {
  const services = use(ServicesContext)
  if (services === undefined) {
    throw new Error('useServices was called outside the provider tree.')
  }
  return services
}

export interface SettingsContextValue {
  readonly settings: AppSettings
  readonly update: (change: Partial<AppSettings>) => void
  readonly athlete: AthleteState
}

export const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

export function useSettings(): SettingsContextValue {
  const value = use(SettingsContext)
  if (value === undefined) {
    throw new Error('useSettings was called outside the provider tree.')
  }
  return value
}
