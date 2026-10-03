import { Table } from 'lucide-react'
import { useState } from 'react'

import { useServices } from '@/app/context'
import { setsCsv } from '@/domain/logging/csv'
import { toDayKey } from '@/domain/time/day'
import { Button } from '@/components/shared/primitives'

/**
 * Every set as a spreadsheet (`setsCsv`) — for somebody who wants their
 * training in a table of their own. Not a backup, and the button says
 * so: nothing reads it back in.
 */
export function ExportCsv() {
  const services = useServices()
  const [busy, setBusy] = useState(false)

  return (
    <Button
      variant="ghost"
      full
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void Promise.all([services.workouts.recent(100_000), services.exercises.all()])
          .then(([logs, library]) => {
            const csv = setsCsv(
              logs,
              (id) => library.find((exercise) => exercise.id === id)?.name ?? id,
            )
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
            const link = document.createElement('a')
            link.href = url
            link.download = `liftos-sets-${toDayKey(services.clock.now())}.csv`
            link.click()
            URL.revokeObjectURL(url)
          })
          .finally(() => {
            setBusy(false)
          })
      }}
    >
      <Table size={16} aria-hidden />
      {busy ? 'Writing…' : 'Every set as a spreadsheet (CSV)'}
    </Button>
  )
}
