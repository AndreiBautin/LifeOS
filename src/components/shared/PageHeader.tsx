import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The top of every screen, treated once instead of seventeen times.
 *
 * It was seventeen copies of the same class string, and the duplication
 * was the smaller half of the problem: a heading and a grey line is what
 * a settings pane looks like, so every screen in the app opened the same
 * way a form does.
 *
 * **Every header carries a way back, because there is no navigation.**
 * The app is one page; the only screens with a header are the ones a
 * link on that page leads to — Program and Settings — so a back link is
 * true of every caller rather than an option one of them sets. It goes to
 * the page rather than `history.back()`, which would leave the app when
 * the screen was opened directly.
 *
 * It briefly carried a lit accent rule above the title, and that is gone
 * again. **A mark that means nothing has to at least read as structure,
 * and this one read as a stray artifact**: it sat above whatever `leading`
 * put first — the portrait, on Today — aligned to the container edge with
 * nothing tying it to the heading, so it floated in the corner. The
 * section rules work because they are attached: a vertical bar directly
 * beside the words it belongs to.
 *
 * The hierarchy is better without it, which is the part worth keeping. A
 * page title is already the largest thing on the screen and needs no
 * badge; the accent bar now means "section", once, and every screen reads
 * the same way. The test it failed is the only one decoration has: it was
 * asked about.
 *
 * **The subtitle is a `div`, not a `p`, and that is a fix rather than a
 * preference.** It takes a `ReactNode`, and what several screens hand it
 * is a block element — Today passes a `Skeleton` while the avatar loads,
 * which renders a `div`. A `div` inside a `p` is invalid HTML, so the
 * browser closes the paragraph early and the DOM stops matching what
 * React rendered: a hydration warning on **every screen in the app**,
 * from one tag in one file. Nothing about the look depends on the `p` —
 * preflight resets its margin and the classes carry the rest — so the
 * cheaper fix is here rather than in `Skeleton`, which would have to
 * become an inline-block `span` on every other call site to make one
 * caller legal.
 *
 * `leading` and `action` exist because three screens already had them —
 * Today's portrait, Character's settings link, Train's Plan and History
 * links. A component that could not hold those would have left three
 * headers hand-rolled and defeated the point.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  leading,
}: {
  readonly title: string
  readonly subtitle?: ReactNode
  readonly action?: ReactNode
  readonly leading?: ReactNode
}) {
  return (
    <header className="mb-6">
      <Link
        viewTransition
        to="/today"
        className="text-ink-500 hover:text-ink-300 tap-target -ml-1 mb-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft size={16} aria-hidden />
        Back
      </Link>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle !== undefined && (
              <div className="text-ink-500 mt-0.5 text-sm">{subtitle}</div>
            )}
          </div>
        </div>
        {action !== undefined && <div className="flex shrink-0 gap-1">{action}</div>}
      </div>
    </header>
  )
}
