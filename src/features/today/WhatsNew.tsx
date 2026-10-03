import { Gift, X } from 'lucide-react'
import { useState } from 'react'

import { useSettings } from '@/app/context'
import { Button, Card } from '@/components/shared/primitives'
import { useRecentWorkouts } from '@/features/train/hooks'

import { RELEASES } from './releases'

/**
 * What changed, said once after an update lands.
 *
 * An installed app updates itself (see `UpdatePrompt`), so a feature can
 * arrive with nothing on screen saying it did — a Pair button nobody
 * looks for is a feature nobody has. **One card, dismissed for good**
 * (`settings.seenNotes` holds the newest id seen), shown only to somebody
 * with training logged: a fresh install has nothing to compare against
 * and the first-run setup to do.
 *
 * Releases are listed in `releases.ts`; only the newest is shown.
 */
export function WhatsNew() {
  const { settings, update } = useSettings()
  const workouts = useRecentWorkouts(1)
  const [open, setOpen] = useState(false)
  const latest = RELEASES[0]

  if (latest === undefined || settings.seenNotes === latest.id) return null
  if (workouts.data === undefined || workouts.data.length === 0) return null

  const dismiss = () => {
    update({ seenNotes: latest.id })
  }

  return (
    <Card className="border-accent-500/35">
      <div className="flex items-center justify-between gap-3">
        <p className="text-accent-400 flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
          <Gift size={14} aria-hidden />
          What's new
        </p>
        <Button variant="ghost" size="sm" aria-label="Dismiss what's new" onClick={dismiss}>
          <X size={14} aria-hidden />
        </Button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {(open ? latest.items : latest.items.slice(0, 2)).map((item) => (
          <li key={item} className="text-ink-100 flex gap-2 text-sm">
            <span className="bg-accent-400 mt-2 size-1 shrink-0 rounded-full" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
      {!open && latest.items.length > 2 && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
          }}
          className="text-accent-400 tap-target mt-1 text-xs font-semibold"
        >
          {latest.items.length - 2} more
        </button>
      )}
    </Card>
  )
}
