import { BookMarked, Dumbbell, Home, Map, Network, Target, User, Wallet } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'

import { ReadFailure } from '@/features/errors/ReadFailure'
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt'
import { LiveRecords } from '@/features/sync/LiveRecords'

/**
 * The shell every screen sits inside.
 *
 * Bottom navigation on a phone rather than a sidebar or a hamburger: this
 * is a phone app used one-handed with a thumb, and the bottom of the
 * screen is the only region a thumb reaches comfortably. StrengthFlow
 * used a vertical icon rail borrowed from a desktop layout, which put
 * every destination at the top-left corner of a six-inch screen.
 *
 * **From `lg` up, that reasoning reverses rather than merely stops
 * applying.** A mouse reaches every corner of a monitor equally, so
 * there is no thumb-reach argument for the bottom strip on desktop —
 * and the fixed bar was sitting on a stretch of screen a cursor never
 * needed to be near, in the one direction a landscape monitor has the
 * least of anyway. `SidebarNav` takes the left edge instead, hidden
 * below `lg`, and the bottom bar hides in exactly the range the
 * sidebar shows.
 */

/*
 * The labels say what the model says. "Quests" and "Tech tree" are the
 * words the domain and the docs have used since the game model was
 * written; the screens were the only place still calling them Projects
 * and Upgrades. "Map" rather than "Atlas", because the route has always
 * been `/map` and that was the one label disagreeing with its own path.
 *
 * Settings, the tech tree and the monthly review are links from You,
 * which is the hub. None of the three is a place you go to *do*
 * something daily, and that is the line: a tab is for somewhere you act,
 * a link on the hub is for somewhere you decide.
 */
/**
 * Seven cells, and it was eight until Today and You became one screen.
 *
 * **That merge fixed an overflow this file used to warn about rather
 * than only saving a slot.** Every cell carries `.tap-target`, a 44-pixel
 * accessibility floor that refuses to shrink — so eight need 352 and an
 * iPhone SE at 320 clipped the last tab by 32. Seven need 308 and fit.
 *
 * The freed room is deliberately left as room. The screens without a tab
 * — Limits, Vitals, Job search, Mind, Houses, Finance, Resume, the tech
 * tree — are eight, and promoting any one of them is a claim that it is
 * used daily. None of them is.
 */
const NAV = [
  /*
   * `/today` under the label "You", which is the screen/type split this
   * app makes everywhere: Quests over `Project`, Codex over `backlog`.
   * The route stays because a PWA shortcut is registered with the
   * operating system at install time — an installed copy goes on asking
   * for the path it was installed with. `/character` redirects here for
   * the same reason.
   */
  { to: '/today', label: 'You', Icon: User },
  { to: '/train', label: 'Train', Icon: Dumbbell },
  { to: '/quests', label: 'Quests', Icon: Target },
  { to: '/backlog', label: 'Codex', Icon: BookMarked },
  { to: '/map', label: 'Map', Icon: Map },
  /*
   * **Party's seat became two**, asked for as _"tech tree and finances
   * should be its own tab, let's replace the party section."_ Social is
   * not being tracked, so the tab went with the trait and the area.
   *
   * That takes the bar to **eight**, which this file's own measurement
   * says is fine at 375 — 46.9 pixels a cell — and clips on a 320-wide
   * iPhone SE 1st-gen, where 8 × 44 = 352 against 320. The 44-pixel tap
   * target is an accessibility floor and does not shrink, so 320 would
   * need a scrolling bar. Chosen deliberately rather than stumbled into.
   *
   * **"Tech" rather than "Tech tree"**, because the label has to fit the
   * cell: at nine characters it measures past the 46.9 available and
   * would wrap or clip. The screen keeps its full name; this is the
   * abbreviation the bar can hold, the same trade "You" made for
   * "Character".
   */
  { to: '/finance', label: 'Finance', Icon: Wallet },
  { to: '/upgrades', label: 'Tech', Icon: Network },
  { to: '/base', label: 'Base', Icon: Home },
] as const

/**
 * The desktop nav, a vertical rail down the left edge from `lg` up.
 *
 * Fixed rather than sticky-in-flow, because it must not scroll with the
 * page it sits beside — a rail that scrolled away would leave desktop
 * worse off than the bottom bar it replaced. `SIDEBAR_WIDTH` is the one
 * number `AppShell`, `RestTimer` and this component all have to agree
 * on, so it is exported rather than repeated as a bare `56` in three
 * places that could quietly drift apart.
 */
export const SIDEBAR_WIDTH = 'w-56' // 14rem / 224px

function SidebarNav() {
  return (
    <nav
      aria-label="Main"
      className={`glass fixed inset-y-0 left-0 z-40 hidden ${SIDEBAR_WIDTH} flex-col border-r lg:flex`}
      style={{
        backgroundColor: 'color-mix(in oklab, var(--surface-raised) 72%, transparent)',
        borderColor: 'var(--border-subtle)',
        paddingTop: 'calc(1.5rem + var(--safe-top))',
      }}
    >
      <ul className="flex flex-col gap-1 px-3">
        {NAV.map(({ to, label, Icon }) => (
          <li key={to}>
            {/*
              Same lit-rather-than-recoloured signal the bottom bar uses,
              turned ninety degrees: a bar down the left edge of the row
              instead of one along its top, since "top" on a horizontal
              rail is the edge closest to the label it marks.
            */}
            <NavLink
              to={to}
              className={({ isActive }) =>
                [
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'text-accent-400' : 'text-ink-500 hover:text-ink-300',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden
                      className="bg-accent-500 absolute inset-y-1 left-0 w-0.5 rounded-full"
                      style={{ boxShadow: '0 0 8px var(--color-accent-500)' }}
                    />
                  )}
                  <Icon size={20} aria-hidden strokeWidth={isActive ? 2.4 : 1.8} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

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
      <ReadFailure />
      <LiveRecords />
      <SidebarNav />

      {/*
        The safe area is the shell's job, not each page's — every screen
        below is an ordinary block of content and none of them should have
        to know a notch exists.

        The sides matter in landscape on a notched phone, where the cutout
        eats into one edge; without them a heading starts underneath it.

        **The safe-area padding is Tailwind arbitrary values now, not an
        inline `style` object, and that is a correctness fix rather than
        a style preference.** An inline `style` always wins the cascade
        over a class regardless of breakpoint, so the `lg:pl-56` this
        line used to carry alongside a `style={{ paddingLeft: … }}` was
        silently overridden at every width — verified by reading the
        *computed* padding at 1024px and finding 16px rather than the
        224px the class asked for, which is the `--color-ink-600` lesson
        this file already knows to apply to itself: a class present in
        the markup is not evidence that it is winning.
      */}
      <main
        id="main"
        className="mx-auto w-full max-w-2xl lg:max-w-4xl xl:max-w-6xl 2xl:max-w-7xl flex-1 pb-28 pt-[calc(1rem_+_var(--safe-top))] pl-[calc(1rem_+_var(--safe-left))] lg:pl-[calc(1rem_+_var(--safe-left)_+_14rem)] pr-[calc(1rem_+_var(--safe-right))]"
      >
        <Outlet />
      </main>

      {/*
        Hidden from `lg` up, where `SidebarNav` takes over — the same
        NAV list, so the two can never disagree about which routes exist.
      */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
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
              {/*
                The active tab is lit rather than merely recoloured.

                A colour change alone is the weakest signal a navigation
                can give, and it was the only one here — on a dark bar,
                one label in orange among seven greys reads as a slightly
                different grey at a glance. The rail above the icon and
                the halo behind it are both anchored to the tab, so the
                answer to "where am I" survives being seen out of the
                corner of an eye in a gym.
              */}
              <NavLink
                to={to}
                className={({ isActive }) =>
                  [
                    'tap-target relative flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors',
                    isActive ? 'text-accent-400' : 'text-ink-500 hover:text-ink-300',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="bg-accent-500 absolute inset-x-3 top-0 h-0.5 rounded-full"
                        style={{ boxShadow: '0 0 8px var(--color-accent-500)' }}
                      />
                    )}
                    <span
                      aria-hidden
                      className="pointer-events-none absolute top-1.5 h-8 w-8 rounded-full transition-opacity"
                      style={{
                        background:
                          'radial-gradient(closest-side, color-mix(in oklab, var(--color-accent-500) 30%, transparent), transparent)',
                        opacity: isActive ? 1 : 0,
                      }}
                    />
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
