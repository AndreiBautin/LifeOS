import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useServices, useSettings } from '@/app/context'
import { seedDemoData } from '@/application/use-cases/demo/seed'
import { clearAllStores } from '@/infrastructure/db/database'
import { logger } from '@/shared/logging/logger'

/**
 * Starting over, and putting the sample back.
 *
 * **Two names, because one of them destroys everything.** `startFresh`
 * wipes every record on this browser; `loadSample` only fills an empty
 * database and refuses otherwise — the refusal is `seedDemoData`'s own,
 * so no call site can ask for "fill" and receive "wipe".
 *
 * Preferences survive a fresh start. They are the person's choices about
 * the app rather than records in it, and the sample data never set them
 * beyond the map's region.
 */
export function useSampleData() {
  const services = useServices()
  const { update } = useSettings()
  const client = useQueryClient()

  const startFresh = useMutation({
    mutationFn: async () => {
      await clearAllStores(services.db)
    },
    onSuccess: () => {
      // `cleared` is what stops a demo build refilling itself on the next open.
      update({ sampleData: 'cleared' })
      logger.info('sample.start-fresh')
      void client.invalidateQueries()
    },
  })

  const loadSample = useMutation({
    mutationFn: async () => {
      const result = await seedDemoData(services)
      return result
    },
    onSuccess: (result) => {
      /*
       * The seed writes `sampleData` through the repository, which the
       * in-memory copy behind `useSettings` has not seen — so it is set
       * here too, or the next `update` anywhere would write it back.
       */
      if (result.seeded) update({ sampleData: 'loaded' })
      logger.info('sample.load', { seeded: result.seeded, reason: result.reason ?? 'none' })
      void client.invalidateQueries()
    },
  })

  return { startFresh, loadSample }
}
