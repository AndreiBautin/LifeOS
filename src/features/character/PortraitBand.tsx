import type { ReactNode } from 'react'

import { Skeleton } from '@/components/shared/Skeleton'

import { AvatarPortrait } from './AvatarPortrait'
import { useAvatar } from './hooks'

/**
 * The top of the sheet: the figure, the level, and the XP behind it.
 *
 * **It is a band rather than a card, and the page has no heading above
 * it.** Asked for directly: *"let's just drop that entire heading
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
 * **Three things have been taken off this band and it is worth knowing
 * what they were**, because each looked load-bearing when it was
 * written.
 *
 * A sentence reading "83% of your XP is dailies" was the evidence for a
 * flavour title above it and outlived the title by a day. The traits
 * band below states the same split eight ways with the arithmetic
 * visible, which is what the percentage was compressing.
 *
 * **The XP rule's fold went next**, asked for as *"let's remove the
 * 'what counts' section."* It read "45 XP all time — what counts?" over
 * a paragraph saying XP is paid for doing a thing and never for it
 * having worked. This file used to argue that deleting it would be worse
 * than keeping it folded, because it is the sentence that stops XP being
 * read as a measure of how well anything went. That argument is answered
 * by the sentence having been read: it is a rule worth meeting once, and
 * it is still written down in `docs/GAME_MODEL.md` and in `registry.ts`.
 * **The number stayed** — deleting a measurement is a larger step than
 * deleting an explanation of it, and this is the only place the whole of
 * your XP is stated.
 *
 * **And the gear went with them:** *"no need to track or show upgrades
 * in that card."* Nothing about upgrades changed — the tech tree still
 * owns them, bought or wanted. What is gone is this card's copy of them,
 * which was a list of titles typed on another screen and the one thing
 * on the band that was not a reading of the XP model.
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

  const { into, level, needed } = avatar.data

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
        </div>
      </div>

      {/*
        The two XP lines sit below the portrait rather than beside it,
        and this is a fix rather than a preference: the column next to a
        120-pixel figure is about 200 wide at 375, which broke "45 / 100
        XP into the level" across two lines mid-phrase. They also belong
        together — one is XP into this level, the other is XP over all of
        it, and reading them adjacent is what makes the difference
        obvious.
      */}
      <p className="text-ink-700 numeric mt-3 text-xs">
        {needed > 0 ? `${String(into)} / ${String(needed)} XP into the level` : 'Top of the ladder'}
      </p>
      <p className="text-ink-700 numeric mt-1 text-xs">{xp} XP all time</p>
    </>
  )
}
