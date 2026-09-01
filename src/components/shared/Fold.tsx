import { useState } from 'react'

/**
 * Rows the day is not asking for, one tap away.
 *
 * The report: *"the homepage is cluttered with everything that gets
 * checked off and stuff for other days."* Both were on screen
 * permanently — a ticked habit stayed in the list as evidence, and
 * habits not due today sat under an "Other days" heading — so a
 * fifteen-habit routine rendered fifteen rows whatever the day actually
 * asked for.
 *
 * **A fold rather than a deletion**, which is the whole reason this is a
 * component and not a filter. A ticked row is the only route to undoing
 * a mis-tap, and habits on other days are the only route to renaming or
 * retiring one — dropping either from the screen would take a working
 * control away to tidy a list.
 *
 * **The summary carries the count**, so the fold says what is inside it
 * before it is opened. A bare "Show more" is a button you have to press
 * to find out whether it was worth pressing.
 *
 * Extracted rather than copied: Today's "later today" fold was written
 * inline, and this is the third list to want the same thing.
 */
export function Fold({
  summary,
  children,
}: {
  /** What is inside, counted. "4 done today", "2 on other days". */
  readonly summary: string
  readonly children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3">
      <button
        type="button"
        className="text-ink-700 hover:text-ink-500 tap-target text-xs"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open)
        }}
      >
        {open ? `Hide ${summary}` : `${summary} — show`}
      </button>

      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}
