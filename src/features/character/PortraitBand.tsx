import type { ReactNode } from 'react'

import { Skeleton } from '@/components/shared/Skeleton'

import { Badge } from '@/components/shared/primitives'

import { AvatarPortrait } from './AvatarPortrait'
import { useAvatar } from './hooks'

/**
 * The top of the sheet: the figure, the level, and what you carry.
 *
 * **It is a band rather than a card now, and the page has no heading
 * above it.** Asked for directly: *"let's just drop that entire heading
 * section and just start with the card."* So the level and the date
 * moved down into it — they were the whole information content of the
 * header, and the portrait was already directly beneath it.
 *
 * **The level is written out beside a ring that draws it too**, which is
 * the one duplication this screen has always accepted: the badge on the
 * ring is a numeral, and a numeral alone does not say what it counts.
 * Nothing else here is drawn twice — the ring *is* the XP bar, same
 * numerator and same denominator as the line under it.
 *
 * **There was a sentence here reading "83% of your XP is dailies" and it
 * is gone.** It was the evidence for a flavour title above it, outlived
 * the title by a day, and went on the ask that merged the season and the
 * traits in below. What replaced it is not nothing: the season band
 * names where this season's XP came from area by area, and the traits
 * split all of it eight ways. Both say what the percentage said, with
 * the arithmetic on screen instead of reduced to one figure.
 */
export function PortraitBand({
  xp,
  today,
  action,
}: {
  readonly xp: number
  readonly today: string
  readonly action?: ReactNode
}) {
  const avatar = useAvatar()

  if (avatar.data === undefined) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-[120px] w-[120px] rounded-full" label="Loading your character" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-3 w-40" />
          <Skeleton className="mt-3 h-5 w-20" />
        </div>
      </div>
    )
  }

  const { gear, gearCount, into, level, needed } = avatar.data

  return (
    <>
      <div className="flex items-center gap-4">
        <AvatarPortrait avatar={avatar.data} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/*
                **The page's `h1`, because dropping the header took its
                only one away.** Headings started at `h2` for a commit,
                which leaves somebody navigating by heading no title for
                the screen the app opens on.

                It is the visible line rather than a hidden "You" bolted
                beside it: this is the largest text on the page and the
                first thing under it is a picture of you, so a hidden
                title would be a second name for the same thing, drifting
                the moment either changed. Which screen you are on is
                said by the nav cell, which carries `aria-current`.
              */}
              <h1 className="text-ink-50 text-lg font-semibold">
                Level <span className="numeric">{level}</span>
              </h1>
              <p className="text-ink-700 numeric mt-0.5 text-xs">{today}</p>
            </div>

            {/*
              The settings link, which had been the page header's action.
              It stays at the top of the screen because that is where it
              was, and because it is the one control up here rather than
              a reading.
            */}
            {action}
          </div>

          {gearCount > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="cool">
                {gearCount} {gearCount === 1 ? 'item' : 'items'}
              </Badge>
            </div>
          )}
        </div>
      </div>

      {/*
        The two XP lines sit below the portrait rather than beside it,
        and this is a fix rather than a preference: the column next to a
        120-pixel figure is about 200 wide at 375, which broke "45 / 100
        XP into the level" across two lines mid-phrase. They also belong
        together — one is XP into this level, the other is XP over all
        of it, and reading them adjacent is what makes the difference
        obvious.
      */}
      <p className="text-ink-700 numeric mt-3 text-xs">
        {needed > 0 ? `${String(into)} / ${String(needed)} XP into the level` : 'Top of the ladder'}
      </p>

      {/*
        The number stays out; the sentence folds away.

        Reported as *"the blurb underneath the avatar might be overkill,
        explaining everything"*, and that is fair — it is a rule, and a
        rule is worth reading once rather than every morning on the
        screen you open most. Deleting it would be worse: it is the
        sentence that stops XP being mistaken for a measure of how well
        anything went, and somebody meeting the number for the first
        time still needs it. A disclosure keeps both.
      */}
      <details className="group mt-1.5">
        <summary className="text-ink-500 marker:content-none flex cursor-pointer list-none items-baseline gap-1.5 text-xs">
          <span className="numeric">{xp} XP all time</span>
          <span className="text-ink-700 group-open:hidden">— what counts?</span>
        </summary>
        <p className="text-ink-700 mt-1.5 text-xs">
          Across everything you track. Paid for doing the thing, never for it having worked —
          getting stronger moves a ladder, and paying it twice is how a number stops being a record
          of effort.
        </p>
      </details>

      {/*
        Gear is what you actually bought, grouped by the upgrade's own
        category. Purchased rather than wanted — a wishlist is not
        equipment — and yours rather than the house's, which is the split
        the Base screen already makes.
      */}
      <div className="border-ink-800 mt-4 border-t pt-3">
        {gear.length === 0 ? (
          <p className="text-ink-500 text-sm">
            Nothing equipped. Upgrades you mark as bought show up here — the house&rsquo;s stay on
            Base.
          </p>
        ) : (
          <dl className="space-y-2">
            {gear.map((slot) => (
              <div key={slot.category} className="flex items-baseline gap-3">
                <dt className="text-ink-700 w-20 shrink-0 text-xs tracking-wide uppercase">
                  {slot.label}
                </dt>
                <dd className="text-ink-300 min-w-0 flex-1 text-sm">{slot.items.join(' · ')}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </>
  )
}
