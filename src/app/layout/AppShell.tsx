import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'

import { useSettings } from '@/app/context'
import { DEFAULT_ACCENT_HUE } from '@/domain/settings/settings'
import { AmbientBackdrop } from './AmbientBackdrop'
import { useCardSpotlight } from './useCardSpotlight'
import { useGitHubSync } from '@/features/sync/useGitHubSync'
import { ReadFailure } from '@/features/errors/ReadFailure'
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt'

/**
 * The shell every screen sits inside, and it has no navigation.
 *
 * **One page, so nothing to navigate between.** Asked for as _"lets just
 * condense this into one page without a navbar"_, once the app had
 * narrowed to a workout tracker and its You, Train and History tabs were
 * three views of one workout log. There was a bottom bar on phones and a
 * collapsible rail from `lg` up; both went, with the sidebar's stored
 * collapsed state. Program and Settings are reached from links on the
 * page and carry their own way back.
 *
 * **The safe area is the shell's job, not each page's** — every screen
 * below is an ordinary block of content and none of them should have to
 * know a notch exists. The sides matter in landscape on a notched phone,
 * where the cutout eats into one edge.
 *
 * **No width cap from `lg` up.** `Masonry`'s `column-width` is a real CSS
 * minimum — the browser only adds a column once there is a full extra
 * column of room — so it, not a ceiling picked for one screen, is what
 * stops a column getting too narrow on a wide monitor.
 */
export function AppShell() {
  /*
   * One document-level listener feeds every card's spotlight. Mounted
   * here so it exists exactly once, for as long as the app does.
   */
  useCardSpotlight()
  useGitHubSync()

  /*
   * **The accent is a setting, applied as one custom property** — every
   * accent token is mixed from `--accent-hue`, so the whole app follows
   * one write. The share card draws on a canvas and keeps cyan.
   */
  const { settings } = useSettings()
  const hue = settings.accentHue ?? DEFAULT_ACCENT_HUE
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-hue', String(hue))
  }, [hue])

  /*
   * The body already carries `padding-bottom: var(--safe-bottom)` to clear
   * the home indicator, so a full-height shell inside it would make the
   * document taller than the viewport by exactly that inset.
   */
  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100dvh - var(--safe-bottom))' }}>
      <a
        href="#main"
        className="sr-only-focusable bg-accent-500 fixed left-2 z-50 rounded-md px-3 py-2 text-sm font-medium text-black"
        style={{ top: 'calc(0.5rem + var(--safe-top))' }}
      >
        Skip to content
      </a>

      <AmbientBackdrop />
      <UpdatePrompt />
      <ReadFailure />

      <main
        id="main"
        className="mx-auto w-full max-w-2xl flex-1 pt-[calc(1rem_+_var(--safe-top))] pr-[calc(1rem_+_var(--safe-right))] pb-6 pl-[calc(1rem_+_var(--safe-left))] lg:max-w-none"
      >
        <Outlet />
      </main>
    </div>
  )
}
