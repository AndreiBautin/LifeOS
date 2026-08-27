import { Dumbbell, Library, Map, Settings, Target, User } from 'lucide-react'
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

const NAV = [
  { to: '/next', label: 'Next', Icon: Target },
  { to: '/train', label: 'Train', Icon: Dumbbell },
  { to: '/backlog', label: 'Backlog', Icon: Library },
  { to: '/map', label: 'Map', Icon: Map },
  { to: '/character', label: 'You', Icon: User },
  { to: '/settings', label: 'Settings', Icon: Settings },
] as const

export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only-focusable bg-accent-500 fixed top-2 left-2 z-50 rounded-md px-3 py-2 text-sm font-medium text-black"
      >
        Skip to content
      </a>

      <UpdatePrompt />

      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28">
        <BackupReminder />
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur"
        style={{
          backgroundColor: 'color-mix(in oklab, var(--surface-raised) 92%, transparent)',
          borderColor: 'var(--border-subtle)',
          paddingBottom: 'env(safe-area-inset-bottom)',
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
