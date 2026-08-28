import type { ReactNode } from 'react'

/**
 * The top of every screen, treated once instead of seventeen times.
 *
 * It was seventeen copies of the same class string, and the duplication
 * was the smaller half of the problem: a heading and a grey line is what
 * a settings pane looks like, so every screen in the app opened the same
 * way a form does. The lit rule above the title is the same accent the
 * section headings carry, turned horizontal, so a page and a panel are
 * visibly the same family at two different sizes.
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
      <span
        aria-hidden
        className="bg-accent-500 mb-2.5 block h-0.5 w-8 rounded-full"
        style={{ boxShadow: '0 0 10px -1px var(--color-accent-500)' }}
      />

      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <div className="min-w-0">
            <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle !== undefined && <p className="text-ink-500 mt-0.5 text-sm">{subtitle}</p>}
          </div>
        </div>
        {action !== undefined && <div className="flex shrink-0 gap-1">{action}</div>}
      </div>
    </header>
  )
}
