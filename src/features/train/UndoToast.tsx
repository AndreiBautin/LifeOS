import { Undo2 } from 'lucide-react'
import { useEffect } from 'react'

import { cn } from '@/lib/cn'

/** How long the way back stays on screen. */
export const UNDO_MS = 5000

/**
 * The way back from a tap that went wrong: "Logged 215 × 3 · Undo" for
 * five seconds after a set is logged or skipped.
 *
 * A swipe, a check and a key all log in one action, which is the point —
 * and one action is also one mis-tap from filing the wrong set. The row's
 * own clear exists but means opening the set again; this is the undo
 * where the mistake was made. **Undo returns the set to pending**, which
 * is what it was a moment before, and cancels the rest the log started.
 *
 * It sits above the rest timer when one is showing (`raised`), so the two
 * never cover each other.
 */
export function UndoToast({
  label,
  stamp,
  raised,
  onUndo,
  onDone,
}: {
  readonly label: string
  /** Changes with every new toast, restarting its clock. */
  readonly stamp: number
  readonly raised: boolean
  readonly onUndo: () => void
  readonly onDone: () => void
}) {
  useEffect(() => {
    const handle = window.setTimeout(onDone, UNDO_MS)
    return () => {
      window.clearTimeout(handle)
    }
  }, [stamp, onDone])

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-40 mx-auto flex max-w-2xl justify-center px-3',
        raised ? 'bottom-28' : 'bottom-4',
      )}
      style={{ marginBottom: 'var(--safe-bottom)' }}
    >
      <div
        role="status"
        className="toast-in border-ink-700 bg-ink-900/95 pointer-events-auto flex items-center gap-3 rounded-full border py-1.5 pr-1.5 pl-4 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/80%)]"
      >
        <span className="text-ink-100 numeric">{label}</span>
        <button
          type="button"
          onClick={onUndo}
          className="tap-target text-accent-400 hover:bg-ink-800 flex items-center gap-1.5 rounded-full px-3 font-semibold"
        >
          <Undo2 size={14} aria-hidden />
          Undo
        </button>
      </div>
    </div>
  )
}
