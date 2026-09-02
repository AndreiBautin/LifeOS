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
  today,
  season,
  traits,
  traitLadders,
  action,
}: {
  readonly today: string
  readonly season?: SeasonProgress | undefined
  readonly traits?: readonly TraitStanding[] | undefined
  /** Ladder rows to draw under a trait, keyed by the trait's id. */
  readonly traitLadders?: Readonly<Record<string, ReactNode>> | undefined
  /** The settings link, which used to be the page header's action. */
  readonly action?: ReactNode
}) {
  return (
    <Card>
      <PortraitBand today={today} {...(action === undefined ? {} : { action })} />

      {/*
        Separated by a rule rather than by a gap, so the bands read as
        parts of one card. A gap wide enough to group would be the
        spacing the sections already had, which is what this replaced.
      */}
      {season !== undefined && (
        <div className="border-ink-800 mt-4 border-t pt-4">
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
