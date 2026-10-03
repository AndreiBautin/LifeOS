import { Keyboard, X } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/shared/primitives'

import { isTypingIn, KEY_HELP, keyActionFor, type KeyAction } from './keyboard'

/**
 * Listens for the player's keys while it is on screen (`keyboard.ts`).
 * A component rather than a hook in the player, so the listener always
 * calls the newest handler without the player's early returns deciding
 * whether a hook runs.
 */
export function KeyboardFlow({ onAction }: { readonly onAction: (action: KeyAction) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = keyActionFor({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        typing: isTypingIn(document.activeElement),
      })
      if (action === undefined) return
      // Enter on a focused button presses that button; the key is the
      // page's only when nothing in particular has focus.
      if (
        action === 'log' &&
        event.key === 'Enter' &&
        document.activeElement instanceof HTMLButtonElement
      ) {
        return
      }
      event.preventDefault()
      onAction(action)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [onAction])
  return null
}

/** The keys, listed: opened with ?, closed with Escape or the button. */
export function KeyHelp({ onClose }: { readonly onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="bg-ink-950/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <div className="card w-full max-w-sm p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-ink-50 flex items-center gap-2 text-base font-semibold">
            <Keyboard size={18} aria-hidden />
            Keys
          </h2>
          <Button variant="ghost" size="sm" aria-label="Close" autoFocus onClick={onClose}>
            <X size={16} aria-hidden />
          </Button>
        </div>
        <dl className="space-y-2">
          {KEY_HELP.map(([keys, what]) => (
            <div key={keys} className="flex items-center justify-between gap-4 text-sm">
              <dt>
                <kbd className="border-ink-700 bg-ink-900 text-ink-100 rounded-md border px-2 py-0.5 font-sans text-xs">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-ink-300 text-right">{what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
