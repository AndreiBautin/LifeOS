import { Share, X } from 'lucide-react'
import { useState } from 'react'

import { STORAGE_KEYS } from '@/config/storage-keys'
import { Button, Card } from '@/components/shared/primitives'
import { useRecentWorkouts } from '@/features/train/hooks'
import { isInstalled } from '@/infrastructure/storage/durability'
import { readFlag, setFlag } from '@/infrastructure/storage/device-flags'

import { installOffer, isIos, promptInstall, useCanPrompt } from './install'

/**
 * Put the app on the home screen, offered once (`installOffer`).
 *
 * Installed, it opens full screen without the browser's bars, keeps its
 * storage on iOS — Safari clears an unvisited tab's after about a week —
 * and is one tap from the lock screen between sets. **The picture is a
 * home screen with this app's tile lit**, which says what the card is for
 * before the sentence does. Dismissed per device, because a phone and a
 * desktop answer it differently.
 */
export function InstallCard() {
  const workouts = useRecentWorkouts(1)
  const canPrompt = useCanPrompt()
  const [dismissed, setDismissed] = useState(() => readFlag(STORAGE_KEYS.installPromptDismissed))
  const offer = installOffer({
    installed: isInstalled(),
    dismissed,
    hasTrained: (workouts.data?.length ?? 0) > 0,
    canPrompt,
    ios: isIos(),
  })

  if (offer === 'none') return null

  const dismiss = () => {
    setFlag(STORAGE_KEYS.installPromptDismissed)
    setDismissed(true)
  }

  return (
    <Card className="flex items-center gap-4">
      <HomeScreen />
      <div className="min-w-0 flex-1">
        <p className="text-ink-50 text-sm font-semibold">Keep it on your home screen</p>
        {offer === 'ios' ? (
          <p className="text-ink-300 mt-1 text-xs leading-relaxed">
            Tap <Share size={12} className="inline align-[-1px]" aria-label="Share" /> in Safari,
            then <span className="text-ink-100">Add to Home Screen</span>. It opens full screen and
            keeps your training safe from Safari's clean-up.
          </p>
        ) : (
          <>
            <p className="text-ink-300 mt-1 text-xs">
              Opens full screen, one tap from the lock screen.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                void promptInstall().then((installed) => {
                  if (installed) dismiss()
                })
              }}
            >
              Install
            </Button>
          </>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        aria-label="Not now"
        onClick={dismiss}
      >
        <X size={14} aria-hidden />
      </Button>
    </Card>
  )
}

/** Six tiles on a phone, this app's lit. */
function HomeScreen() {
  return (
    <svg viewBox="0 0 40 64" className="h-16 w-10 shrink-0" aria-hidden>
      <rect x="1" y="1" width="38" height="62" rx="7" className="fill-ink-900 stroke-ink-700" />
      {[0, 1, 2].map((row) =>
        [0, 1].map((col) => {
          const lit = row === 1 && col === 1
          return (
            <rect
              key={`${String(row)}-${String(col)}`}
              x={8 + col * 14}
              y={12 + row * 14}
              width="10"
              height="10"
              rx="3"
              className={lit ? 'fill-accent-500 install-tile' : 'fill-ink-800'}
            />
          )
        }),
      )}
      <rect x="15" y="56" width="10" height="2" rx="1" className="fill-ink-700" />
    </svg>
  )
}
