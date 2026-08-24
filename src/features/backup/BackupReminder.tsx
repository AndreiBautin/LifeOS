import { Download, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import { useBackup } from './useBackup'

/**
 * A prompt to take a backup.
 *
 * This app has no server, so an export is the only thing standing between
 * a lifter and losing years of training to a cleared browser or a new
 * phone. A backup feature nobody is ever prompted to use is worth
 * nothing, so the app asks — after a fortnight, or after ten sessions,
 * whichever comes first.
 *
 * Dismissible for the session, and never shown to someone with nothing to
 * lose.
 */
export function BackupReminder() {
  const { status } = useBackup()
  const [dismissed, setDismissed] = useState(false)

  if (!status.shouldRemind || dismissed) return null

  return (
    <Card className="border-warn-500/40 bg-warn-500/10 mb-4 flex items-start gap-3 p-3">
      <Download size={18} className="text-warn-500 mt-0.5 shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-ink-50 text-sm font-medium">Back up your training</p>
        <p className="text-ink-300 mt-0.5 text-sm">
          {status.reason} Everything lives on this device only.
        </p>
        <Link
          to="/settings"
          className={cn(buttonStyles({ variant: 'outline', size: 'sm' }), 'mt-2.5')}
        >
          Export now
        </Link>
      </div>

      <button
        type="button"
        onClick={() => {
          setDismissed(true)
        }}
        aria-label="Dismiss backup reminder"
        className="text-ink-500 hover:text-ink-300 tap-target -mt-1 -mr-1 flex items-center justify-center"
      >
        <X size={16} aria-hidden />
      </button>
    </Card>
  )
}
