import type { ReactNode } from 'react'

import { Card } from '@/components/shared/primitives'
import type { TraitStanding } from '@/domain/game/traits'

import { MainLifts } from './MainLifts'
import { PortraitBand } from './PortraitBand'
import { Traits } from './Traits'

/**
 * The character sheet, as one card and the first thing on the screen.
 *
 * Asked for in two parts: *"let's just drop that entire heading section
 * and just start with the card"*, and *"merge in the season and
 * attributes stuff into the first card."* What had been a page header
 * and three stacked blocks is one object now.
 *
 * **They are one reading, which is why they merge cleanly.** The level
 * is XP over the whole of your time, the season is XP over this chapter
 * of it, and the traits are the same XP split eight ways. Three headings
 * and 2rem of air between them said these were separate questions; they
 * are the same quantity at three resolutions, and a card is what says
 * so.
 *
 * **The cost, and it is the one the page's own note predicted.** This
 * card is tall — a portrait, a disclosure, gear, a season with a meter
 * and three months, and eight trait bars — and every one of those sits
 * above the first checkbox of the day. If ticking a habit starts feeling
 * like it is buried, this is the thing to suspect, and the cheapest fix
 * is a fold on the traits rather than a section heading back.
 *
 * **A band draws its own name; the card draws none.** There is no title
 * over the portrait, because a page that opens on a picture of you does
 * not need to be told it is about you — and the two bands under it say
 * what they are, since a card holding three readings has to.
 */
export function SheetCard({
  traits,
  action,
  avatarSize,
}: {
  readonly traits?: readonly TraitStanding[] | undefined
  /** The settings link, which used to be the page header's action. */
  readonly action?: ReactNode
  /** Forwarded to `PortraitBand`/`AvatarPortrait`; see its own doc for what `'large'` does. */
  readonly avatarSize?: 'large'
}) {
  return (
    <div className="relative">
      {/*
        **A slow wash behind the card, `lg` and `large` only.** Reported
        after the width and column fixes still left the page "sparse
        with cards": _"I'm thinking more or adding in new UI elements to
        make this app feel more alive and premium."_ This is one of the
        four directions chosen from that reply. It sits *behind* the
        card in DOM order and `-z-10` in paint order, `pointer-events-none`
        so it can never intercept a click meant for the card above it,
        and it is not clipped to the card's own rounded corners — a wash
        that bleeds past the edge reads as ambient light rather than as a
        second, smaller card glowing inside the first.

        **`lg`, not `2xl`** — it shipped at `2xl` and a real two-monitor
        screenshot showed a secondary monitor's window sitting above
        `lg` and below `2xl`, getting none of it. `lg` is the line the
        desktop sidebar nav already switches on.
      */}
      {avatarSize === 'large' && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10 hidden rounded-[2rem] lg:block"
          style={{
            background: 'radial-gradient(60% 60% at 30% 20%, var(--glow-accent), transparent 70%)',
          }}
        >
          <div className="sheet-glow h-full w-full" />
        </div>
      )}

      <Card>
        {/*
          **The figure and its season are one block, with no rule between
          them.** Asked for as _"can we move the season progress up into
          the row with the avatar."_ The season names itself in the column
          beside the portrait and its bar runs full width underneath, which
          is the only place a meter fits: the column next to a 120-pixel
          figure is about 200 wide at 375.

          A rule here would say these are two readings. They are one — the
          level is XP over all of it and the season is XP over this chapter
          — and the traits below still get their rule, because that is
          genuinely the same quantity split a third way.
        */}
        <PortraitBand
          {...(action === undefined ? {} : { action })}
          {...(avatarSize === undefined ? {} : { avatarSize })}
        />

        {traits !== undefined && (
          <div className="border-ink-800 mt-4 border-t pt-4">
            {/*
              **`MainLifts` replaced `TraitRadar` in this exact slot.**
              Reported against the radar: "the secondary graph for
              attributes would make more sense as showing off the 1RMs
              for the main lifts instead." The trait bars still lead —
              they are XP, the currency this card is otherwise entirely
              about — and the lifts sit beside them at `lg` and up, the
              same "freed width" reasoning the radar was built for, on
              data that is actually built to move week to week rather
              than XP's slow, steady climb. See `MainLifts`' own doc.
            */}
            <div className="lg:grid lg:grid-cols-[1fr_auto] lg:items-start lg:gap-6">
              <Traits traits={traits} />
              {avatarSize === 'large' && (
                <div className="hidden lg:block lg:w-64">
                  <MainLifts />
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
