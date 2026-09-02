import type { ReactNode } from 'react'

import type { SeasonProgress } from '@/application/use-cases/character/season-progress'
import { Card } from '@/components/shared/primitives'
import type { TraitStanding } from '@/domain/game/traits'

import { PortraitBand } from './PortraitBand'
import { SeasonBand } from './SeasonBand'
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
  season,
  traits,
  traitLadders,
  action,
}: {
  readonly season?: SeasonProgress | undefined
  readonly traits?: readonly TraitStanding[] | undefined
  /** Ladder rows to draw under a trait, keyed by the trait's id. */
  readonly traitLadders?: Readonly<Record<string, ReactNode>> | undefined
  /** The settings link, which used to be the page header's action. */
  readonly action?: ReactNode
}) {
  return (
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
        {...(season === undefined ? {} : { season })}
        {...(action === undefined ? {} : { action })}
      />

      {season !== undefined && (
        <div className="mt-4">
          <SeasonBand progress={season} />
        </div>
      )}

      {traits !== undefined && (
        <div className="border-ink-800 mt-4 border-t pt-4">
          <Traits
            traits={traits}
            {...(traitLadders === undefined ? {} : { ladders: traitLadders })}
          />
        </div>
      )}
    </Card>
  )
}
