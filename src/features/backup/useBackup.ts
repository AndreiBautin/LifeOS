import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useServices, useSettings } from '@/app/context'
import type { BackupEnvelope, ImportMode, ImportPreview } from '@/domain/backup/envelope'
import { backupStatus } from '@/domain/settings/settings'
import {
  applyBackup,
  backupFilename,
  buildBackup,
  parseBackup,
  serialiseBackup,
} from '@/infrastructure/backup/backup-service'
import { clearAllStores } from '@/infrastructure/db/database'
import { logger } from '@/shared/logging/logger'

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev'

/**
 * Export and import, from the UI's point of view.
 *
 * The download is deliberately a Blob and an anchor click rather than
 * anything cleverer: it is the one mechanism that works in an installed
 * PWA on both iOS and Android, where the File System Access API does not
 * exist.
 */
export function useBackup() {
  const services = useServices()
  const { settings, update } = useSettings()
  const client = useQueryClient()

  const [preview, setPreview] = useState<ImportPreview | undefined>(undefined)
  const [pending, setPending] = useState<BackupEnvelope | undefined>(undefined)

  const workoutCount = useQuery({
    queryKey: ['workouts', 'count'],
    queryFn: () => services.workouts.count(),
  })

  const exportBackup = useMutation({
    mutationFn: async () => {
      const now = services.clock.now()
      const envelope = await buildBackup(services, {
        settings,
        appVersion: APP_VERSION,
        now,
      })

      const blob = new Blob([serialiseBackup(envelope)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = backupFilename(now)
      anchor.click()

      // Revoked on the next tick rather than immediately: Safari has been
      // known to cancel an in-flight download when the object URL is
      // released synchronously.
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 1000)

      return now
    },
    onSuccess: (now) => {
      update({ lastExportAt: now.toISOString() })
      logger.info('backup.export')
    },
  })

  const inspect = (contents: string): void => {
    const parsed = parseBackup(contents)
    setPreview(parsed.preview)
    setPending(parsed.envelope)
    logger.info('backup.inspect', { valid: parsed.preview.valid })
  }

  const runImport = useMutation({
    mutationFn: async (mode: ImportMode) => {
      if (pending === undefined) throw new Error('No backup has been selected.')

      // Replace clears first, as its own named operation. Merge never
      // touches this path, so a mis-click cannot turn one into the other.
      if (mode === 'replace') await clearAllStores(services.db)

      const result = await applyBackup(pending, services, mode)
      if (result.settings !== undefined) update(result.settings)
      return result
    },
    onSuccess: (result) => {
      logger.info('backup.import', { workouts: result.imported.workouts })
      void client.invalidateQueries()
      setPreview(undefined)
      setPending(undefined)
    },
  })

  const status = backupStatus(settings, workoutCount.data ?? 0, services.clock.now())

  return {
    status,
    preview,
    canImport: pending !== undefined,
    exportBackup,
    inspect,
    runImport,
    clearPreview: () => {
      setPreview(undefined)
      setPending(undefined)
    },
  }
}
