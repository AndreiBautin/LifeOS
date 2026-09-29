import { X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useSettings } from '@/app/context'
import { buttonStyles } from '@/components/shared/styles'

/**
 * One line saying the app is showing somebody who does not exist.
 *
 * Without it a visitor cannot tell a made-up person's quests from a
 * template they are meant to keep, and the way to their own empty app —
 * Start fresh, in Settings — is three screens from anywhere they would
 * look. It goes the moment it is dismissed or the sample is cleared, and
 * does not come back on its own.
 */
export function SampleNotice() {
  const { settings, update } = useSettings()
  if (settings.sampleData !== 'loaded') return null

  return (
    <div className="border-accent-500/30 bg-accent-500/5 mb-6 flex items-center gap-3 rounded-xl border px-4 py-2">
      <p className="text-ink-300 min-w-0 flex-1 text-sm">
        You&rsquo;re looking at sample data. Everything stays in this browser.{' '}
        <Link to="/settings" className="text-accent-400 font-medium whitespace-nowrap">
          Start fresh →
        </Link>
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        className={buttonStyles({ variant: 'ghost', size: 'sm' })}
        onClick={() => {
          update({ sampleData: 'kept' })
        }}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  )
}
