import type { ReactNode } from 'react'

import { Card } from '@/components/shared/primitives'

import { useCharacterSheet } from './hooks'
import { PortraitBand } from './PortraitBand'
import { Traits } from './Traits'

/**
 * The character sheet, as one card and the first thing on the screen.
 *
 * Asked for in three parts now: *"let's just drop that entire heading
 * section and just start with the card"*, *"merge in the season and
 * attributes stuff into the first card,"* and, against the standalone
 * XP wheel a screen down, *"it makes sense to have the where the xp
 * came from section folded in with the traits and avatar section."*
 * What had been a page header and four stacked blocks is one object.
 *
 * **The XP wheel came off again when the app narrowed to training.** It
 * split the XP by area, and with three areas each feeding exactly one
 * trait it was the trait bars drawn a second time as a pie. What is
 * left is the level and the traits: one quantity, over all of it and
 * then split three ways.
 *
 * **`MainLifts` left this card earlier** — the lift radar is a strength
 * standard rather than a reading of this card's XP, and it lives on
 * Train beside `StrengthStandards`.
 *
 * **A band draws its own name; the card draws none.** There is no title
 * over the portrait, because a page that opens on a picture of you does
 * not need to be told it is about you — and the bands under it say what
 * they are, since a card holding several readings has to.
 *
 * **Reads the sheet itself now, rather than taking `traits` as a
 * prop.** The wheel needs the whole `CharacterSheet` (every area's XP,
 * not just the trait projection of it), so the caller handing over one
 * query's data and this component fetching a second itself would be two
 * copies of the same read. `HomePage` no longer touches
 * `useCharacterSheet` at all.
 */
export function SheetCard({
  action,
  avatarSize,
}: {
  /** The settings link, which used to be the page header's action. */
  readonly action?: ReactNode
  /** Forwarded to `PortraitBand`/`AvatarPortrait`; see its own doc for what `'large'` does. */
  readonly avatarSize?: 'large'
}) {
  const sheet = useCharacterSheet()
  const traits = sheet.data?.traits

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
            <Traits traits={traits} />
          </div>
        )}
      </Card>
    </div>
  )
}
