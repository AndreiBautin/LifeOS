import {
  BookMarked,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Home,
  Map,
  Network,
  Target,
  User,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { STORAGE_KEYS } from '@/config/storage-keys'
import { ReadFailure } from '@/features/errors/ReadFailure'
import { UpdatePrompt } from '@/features/pwa/UpdatePrompt'
import { LiveRecords } from '@/features/sync/LiveRecords'
import {
  readSidebarCollapsed,
  saveSidebarCollapsed,
} from '@/infrastructure/storage/sidebar-collapsed-store'

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
 * Seven cells, after a round trip through eight and five.
 *
 * **Quests, Finance and Train all folded into Today at various points,
 * each on its own explicit ask, and all three un-folded together.** The
 * fold reasoning was sound at the time — a page with too little content
 * to fill a wide monitor without looking awkward. It stopped being sound
 * once all three were folded in *at once*: the combined page grew taller
 * than a landscape-desktop window could show without either scrolling or
 * shrinking every card to illegible size, which is what a persistent
 * "still looks cramped" report turned out to trace back to — see
 * `HomePage`'s own doc for the diagnosis. Splitting back into separate
 * screens is what keeps each one short enough to read at full size.
 *
 * **Finance then came off the bar again, on different grounds.** Not a
 * height problem this time — a portfolio one, reported directly: "it
 * doesn't really fit and could vibe weird to employers." This deployed
 * build is the demo build a reviewer actually opens, and a personal
 * finance tab sitting beside a training app is an odd thing for that
 * reviewer to land on. The screen and the tab are gone; the quest arc's
 * salary/savings stages still work, reading from whatever is already on
 * file rather than through a dedicated editor — see
 * `application/use-cases/finance/finance.ts`'s own doc.
 *
 * **This file's own measurement already covers eight cells**, from
 * before the first fold: 46.9 pixels each at 375 wide, nothing clips,
 * and the one real limit is a 320-wide iPhone SE 1st-gen, where
 * `8 × 44 = 352` overflows by 32 — the 44-pixel tap target is an
 * accessibility floor and does not shrink, so that width would need a
 * horizontally scrolling bar rather than a narrower cell. Seven fits
 * with more room again now that Finance is gone.
 *
 * The freed room in the bar was, for a while, deliberately left as
 * room — the screens without a tab (Limits, Vitals, Job search, Mind,
 * Houses, Resume) are a claim that none of them is used daily. Quests
 * and Train are not "used daily" in quite the same sense either, but
 * each one holds enough content on its own that folding it back into
 * Today is what caused the height problem in the first place, so the
 * room goes to un-cramming rather than staying unclaimed.
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
   * **"Tech" rather than "Tech tree"**, because the label has to fit the
   * cell: at nine characters it measures past the 46.9 available and
   * would wrap or clip. The screen keeps its full name; this is the
   * abbreviation the bar can hold, the same trade "You" made for
   * "Character".
   */
  { to: '/upgrades', label: 'Tech', Icon: Network },
  { to: '/base', label: 'Base', Icon: Home },
] as const

/**
 * The desktop nav, a vertical rail down the left edge from `lg` up.
 *
 * Fixed rather than sticky-in-flow, because it must not scroll with the
 * page it sits beside — a rail that scrolled away would leave desktop
 * worse off than the bottom bar it replaced.
 *
 * **Its width is a CSS custom property, not a Tailwind class, because
 * it now has two states.** `AppShell` sets `--sidebar-w` once on the
 * shell's outer element; this component, `main`'s padding and
 * `RestTimer`'s position all read the same variable rather than each
 * carrying its own copy of "expanded or collapsed" that could drift
 * out of step with the other two.
 */
const SIDEBAR_EXPANDED = '14rem' // 224px
const SIDEBAR_COLLAPSED = '4.5rem' // 72px, icon plus its own padding

function SidebarNav({
  collapsed,
  onToggle,
}: {
  readonly collapsed: boolean
  readonly onToggle: () => void
}) {
  return (
    <nav
      aria-label="Main"
      className="glass fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r transition-[width] duration-200 lg:flex"
      style={{
        backgroundColor: 'color-mix(in oklab, var(--surface-raised) 72%, transparent)',
        borderColor: 'var(--border-subtle)',
        paddingTop: 'calc(1.5rem + var(--safe-top))',
      }}
    >
      <ul className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ to, label, Icon }) => (
          <li key={to}>
            {/*
              Same lit-rather-than-recoloured signal the bottom bar uses,
              turned ninety degrees: a bar down the left edge of the row
              instead of one along its top, since "top" on a horizontal
              rail is the edge closest to the label it marks.

              Collapsed drops the label and centres the icon rather than
              truncating the text, and picks up an `aria-label` in its
              place — a visible label and an `aria-label` together would
              leave the two disagreeing about which one is the accessible
              name, so this is either-or rather than both-always.
            */}
            <NavLink
              to={to}
              {...(collapsed ? { 'aria-label': label } : {})}
              title={label}
              className={({ isActive }) =>
                [
                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center' : '',
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
                  <Icon
                    size={20}
                    aria-hidden
                    strokeWidth={isActive ? 2.4 : 1.8}
                    className="shrink-0"
                  />
                  {!collapsed && <span>{label}</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="border-ink-800 border-t px-3 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={[
            'text-ink-500 hover:text-ink-300 tap-target flex w-full items-center gap-3 rounded-lg px-3 transition-colors',
            collapsed ? 'justify-center' : '',
          ].join(' ')}
        >
          {collapsed ? (
            <ChevronRight size={18} aria-hidden />
          ) : (
            <>
              <ChevronLeft size={18} aria-hidden />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
      </div>
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
  const [collapsed, setCollapsed] = useState(() =>
    readSidebarCollapsed(STORAGE_KEYS.sidebarCollapsed),
  )

  return (
    <div
      className="flex flex-col"
      style={
        {
          minHeight: 'calc(100dvh - var(--safe-bottom))',
          '--sidebar-w': collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
        } as React.CSSProperties
      }
    >
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
      <SidebarNav
        collapsed={collapsed}
        onToggle={() => {
          setCollapsed((current) => {
            const next = !current
            saveSidebarCollapsed(STORAGE_KEYS.sidebarCollapsed, next)
            return next
          })
        }}
      />

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

        **The cap went to `min(94vw,2400px)` and back to a fixed number,
        and both moves were correct for what the page held at the time.**
        A viewport-proportional cap was the right fix for a page with a
        handful of thin cards and a lot of empty width to account for —
        `94vw` meant the cap could never again be "generous on one
        assumed screen and short on the next", which was the exact
        mistake a fixed `1600px` had just made. That argument does not
        survive the page gaining real content: once `SheetCard` carries a
        radar, two pulse rings and a glow, and the quest and challenge
        cards carry a roadmap and a ring, growing the shell to 94% of a
        genuinely wide monitor spreads that same content into more, and
        thinner, masonry columns rather than filling the extra width —
        which is exactly the "big empty void on the right and bottom" a
        real two-monitor screenshot showed on the main display.

        **`2xl:max-w-[1600px]` is back, deliberately not proportional
        this time.** The point of a fixed cap here is that it *should
        not* keep growing with the monitor — past this width the answer
        to "how do I fill the rest" is more real content on the cards
        that exist, which is what shipped alongside this change, not a
        wider stage for the same five cards to spread thinner across.

        **Raised to `2000px`, once Quests merged in and there was
        genuinely more content to spread.** Reported: "why would the 4th
        column be narrower — just use the massive amount of horizontal
        padding." Right — `column-width:22rem` already stretches
        existing columns to fill whatever width `main` hands it, so a
        4th column does not need `column-width` narrowed at all; it only
        needs `main` to hand over enough width for one. At `2000px`,
        content width comes out to roughly 1740px after the sidebar and
        padding, which is enough for four columns comfortably over
        `400px` each — safely above the ~375px `SheetCard`'s avatar-plus-
        heading row needs, which is the exact failure mode a too-narrow
        column caused two commits ago.

        **Raised again to `2400px`, and `column-width` raised alongside
        it rather than left alone.** Reported: "looking better but can
        we still reduce the horizontal padding." `2000px` sat close to a
        cliff: content width there was already at 4.95 columns' worth of
        the 22rem minimum, so any further increase to the cap alone would
        have tipped a fifth column into existence at an unsafe width —
        the same wrapping failure, reintroduced by the next honest
        attempt to shrink the margins. `HomePage.tsx` raises
        `column-width` to `26rem` at `2xl` for the same range this cap
        applies to, so the freed width goes into four *wider* columns
        (~500px+ at this cap) rather than a fifth narrow one.

        **The cap was gone at `2xl` and not before, and that was still
        too conservative.** Reported against a real wide monitor whose
        browser window sat in the `xl` tier rather than past `2xl`
        (1536px): the page was still visibly capped at `max-w-6xl`
        (1152px) with real gutters on both sides — "just stretch so all
        the cards fit the full width of the screen, unless it's mobile
        or portrait, in which case stack." That is a plainer rule than
        three tiers converging on `none`: there is no reason to wait for
        a specific pixel threshold once `column-width` is doing the real
        safety work (see below), so the cap drops out entirely as soon
        as the layout is in its landscape-desktop shape at all — `lg`,
        the same breakpoint every stacked grid on this page switches to
        columns at.

        `column-width` is the part of this that was never a guess: it is
        a real CSS *minimum*, and the browser only ever adds a column
        once there is a full extra `column-width + gap` of room —
        existing columns stretch wider first, so per-column width can
        never drop below the minimum however wide `main` gets. That
        makes the outer cap redundant as a safety mechanism once
        `column-width` carries it: `main` can fill however much space
        the sidebar leaves it (`lg:max-w-none`) and the page still
        cannot produce an unsafely narrow column on any monitor, because
        `column-width:22rem`/`26rem` is the thing refusing that, not a
        ceiling picked to suit one assumed screen.
      */}
      <main
        id="main"
        /*
         * `pb-28` clears the fixed bottom nav on a phone; from `lg` up
         * that nav is gone (`SidebarNav` takes the left edge instead), so
         * the same padding was 112px of dead space at the bottom of every
         * desktop page for no reason any element still needed. `lg:pb-6`
         * recovers it.
         */
        className="mx-auto w-full max-w-2xl lg:max-w-none flex-1 pb-28 lg:pb-6 pt-[calc(1rem_+_var(--safe-top))] pl-[calc(1rem_+_var(--safe-left))] lg:pl-[calc(1rem_+_var(--safe-left)_+_var(--sidebar-w))] pr-[calc(1rem_+_var(--safe-right))]"
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
