import { BookMarked, CalendarDays, Dumbbell, Home, Map, Target, User, Users } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { BackupReminder } from '@/features/backup/BackupReminder'
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt'

/**
 * The shell every screen sits inside.
 *
 * Bottom navigation rather than a sidebar or a hamburger: this is a phone
 * app used one-handed with a thumb, and the bottom of the screen is the
 * only region a thumb reaches comfortably. StrengthFlow used a vertical
 * icon rail borrowed from a desktop layout, which put every destination
 * at the top-left corner of a six-inch screen.
 */

/*
 * Character first, because it is now the readout for every area rather
 * than a strength sheet. It sat fifth on reasoning that expired: when this
 * order was set it showed bodyweight multiples and an XP bar fed only by
 * workouts, which is not something to open an app to.
 *
 * The labels say what the model says. "Quests" and "Tech tree" are the
 * words the domain and the docs have used since the game model was
 * written; the screens were the only place still calling them Projects and
 * Upgrades.
 *
 * **Seven seats, not six, and the labels paid for it.** "Character"
 * became "You" and "Tech tree" moved out entirely, because seven cells on
 * a 375-pixel screen are 53 pixels wide and "Character" measures 53 —
 * exactly the width with nothing left for padding. With the longest
 * remaining label at 38 pixels there is room to spare. Measured rather
 * than guessed; the widths are in the commit that added the seventh.
 *
 * Settings, the tech tree and the monthly review are links from You,
 * which is the hub. None of the three is a place you go to *do* something
 * daily, and that is the line: a tab is for somewhere you act, a link on
 * the hub is for somewhere you decide.
 *
 * "Map" rather than "Atlas": the route has always been `/map`, and that
 * was the one label in here that disagreed with its own path.
 */
const NAV = [
  { to: '/today', label: 'Today', Icon: CalendarDays },
  { to: '/character', label: 'You', Icon: User },
  { to: '/train', label: 'Train', Icon: Dumbbell },
  { to: '/quests', label: 'Quests', Icon: Target },
  { to: '/backlog', label: 'Codex', Icon: BookMarked },
  { to: '/map', label: 'Map', Icon: Map },
  { to: '/party', label: 'Party', Icon: Users },
  { to: '/base', label: 'Base', Icon: Home },
] as const

export function AppShell() {
  /*
   * The shell is `100dvh` *minus the bottom inset*, not `min-h-dvh`.
   *
   * The body already carries `padding-bottom: var(--safe-bottom)` to clear
   * the home indicator, so a full-height shell inside it makes the document
   * taller than the viewport by exactly that inset. Every short page on a
   * notched phone had thirty-four pixels of scroll with nothing in them.
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

      <UpdatePrompt />

      {/*
        The safe area is the shell's job, not each page's — every screen
        below is an ordinary block of content and none of them should have
        to know a notch exists.

        The sides matter in landscape on a notched phone, where the cutout
        eats into one edge; without them a heading starts underneath it.
      */}
      <main
        id="main"
        className="mx-auto w-full max-w-2xl flex-1 pb-28"
        style={{
          paddingTop: 'calc(1rem + var(--safe-top))',
          paddingLeft: 'calc(1rem + var(--safe-left))',
          paddingRight: 'calc(1rem + var(--safe-right))',
        }}
      >
        <BackupReminder />
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-40 border-t"
        style={{
          // Let more through now the blur is stronger. At 92% opaque the
          // frost had nothing to work with and the effect was invisible.
          backgroundColor: 'color-mix(in oklab, var(--surface-raised) 72%, transparent)',
          borderColor: 'var(--border-subtle)',
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        <ul className="mx-auto flex max-w-2xl">
          {NAV.map(({ to, label, Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  [
                    'tap-target flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors',
                    isActive ? 'text-accent-400' : 'text-ink-500 hover:text-ink-300',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={20} aria-hidden strokeWidth={isActive ? 2.4 : 1.8} />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
