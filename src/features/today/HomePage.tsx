import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { TodayGoals } from '@/features/backlog/TodayGoals'
import { ChallengePass } from '@/features/challenges/ChallengePass'
import { SheetCard } from '@/features/character/SheetCard'
import { useCharacterSheet, useSeasonProgress } from '@/features/character/hooks'
import { LimitsCard } from '@/features/vitals/LimitsCard'
import { WeightTrend } from '@/features/vitals/WeightTrend'

/**
 * Who you are, and what today asks of you.
 *
 * **This merges Today and You, and it reverses a rule this file used to
 * state.** That rule was "Today is present tense, You is standing", and
 * the corollary was that within Today the order runs work first and
 * readout last — the season sat below the checkboxes precisely so that
 * "a progress bar above the checkboxes" would not make the first thing
 * you see each morning a score rather than a task.
 *
 * It was reversed deliberately, by the person using it, on the grounds
 * that *the character progression is the main thing and should be shown
 * first.* That is a legitimate call about their own app and it is
 * recorded here rather than quietly applied.
 *
 * **Quests, Finance and Train all folded in here for a while, and all
 * three un-folded again.** Each was asked for directly — condensing
 * pages that felt too sparse on a wide monitor — and each held for as
 * long as the resulting page was short enough to read without a
 * scrollbar. It stopped holding once all three were folded in at once:
 * natural content height outgrew what a typical landscape-desktop
 * window could show, and the `useFitToViewport` mechanism built to
 * avoid a scrollbar on a large monitor was shrinking the *entire page*
 * to compensate — reported as "still condensed" well after a real width
 * fix had already landed and been verified live, and only explained by
 * reading the actual DOM on the reporter's own browser through the
 * Claude-in-Chrome extension, which found a `transform: scale(0.43)`
 * centred on the block. At 2765px of natural content height against a
 * ~1200px available window, no scale exists that both avoids a
 * scrollbar and keeps the text legible.
 *
 * Given the choice — full-size text with ordinary scroll, or a
 * shrink-to-fit that reads as tiny and cramped — the explicit answer was
 * neither: split the zones back into their own screens, `/quests`,
 * `/finance`, and `TrainZone` back under `/train`, so no one page has to
 * hold this much height at once. `useFitToViewport.ts` is deleted with
 * no caller left to use it. What is left here — `SheetCard` and the
 * day's own readouts — is short enough that this page has never needed
 * scroll protection in the first place.
 *
 * **One zone now, not several.** With Quests, Finance and Train gone,
 * the only grouped block left is the day's own readouts — Buffs,
 * Weight, today's reading goals, the season card — which do not need a
 * "Today" heading repeating the page's own subject.
 */

export function HomePage() {
  const season = useSeasonProgress()
  const sheet = useCharacterSheet()

  return (
    <div className="space-y-8 lg:space-y-10">
      {/*
        ── The glance ──────────────────────────────────────────────────
        Who you are, the chapter you are in, and the same XP split eight
        ways. One card, because those are one quantity at three
        resolutions rather than three questions. No heading of its own —
        a page that opens on a picture of you does not need to be told
        it is about you, the same call this file has made since the
        page had no header at all.

        **Capped at `lg:max-w-xl`, and set beside the day's readouts
        rather than stacked above them.** Both needed a real fix rather
        than being left alone. Pulling `SheetCard` out of the old
        page-wide masonry flow to make room for zones also pulled it out
        of the one thing that had ever bounded its width — a masonry
        column — so with nothing capping it, it stretched to the full
        page: reported as "cap it back to match the other cards' width."
        `xl` (36rem) sits a little wider than a single zone column on
        purpose — this card carries an avatar, `MainLifts` and eight
        trait bars, genuinely more than a Buffs or weight-trend card
        holds, so matching a column exactly would have squeezed it back
        toward a wrapping bug an earlier commit already had to fix.

        **Stacking it above the readouts full-width also left the entire
        row beside it empty**, reported once already for the same
        arrangement beside a different neighbour: "you have to scroll to
        see everything despite lots of white space on the first row."
        Capping the width fixed how thin the card spread; it did nothing
        about the fact that a capped, standalone block no longer shares
        a row with anything. `lg:flex` puts the two side by side instead
        — `SheetCard` fixed at its own cap on the left, the day's
        readouts filling whatever width is left on the right.
      */}
      <div className="space-y-10 lg:flex lg:items-start lg:gap-8 lg:space-y-0">
        <div className="lg:max-w-xl lg:shrink-0">
          <SheetCard
            {...(sheet.data === undefined ? {} : { traits: sheet.data.traits })}
            avatarSize="large"
            action={
              <Link
                to="/settings"
                aria-label="Settings"
                className={buttonStyles({ variant: 'ghost', size: 'sm' })}
              >
                <Settings size={16} aria-hidden />
              </Link>
            }
          />
        </div>

        {/*
          **A fixed 2-column pairing, not an auto-balanced masonry
          flow.** Reported against an auto-balanced version elsewhere on
          this page, before it moved out: "maybe move the bottom row up
          so we don't need to scroll... and fill that last bit of bottom
          right space." `column-fill:balance` genuinely struggles with
          only four blocks of wildly different heights — `ChallengePass`
          alone can be four times `TodayGoals`' height. Four blocks are
          simple enough to pair by hand instead: `LimitsCard` and
          `WeightTrend` are both compact day-to-day readouts,
          `TodayGoals` and `ChallengePass` are both slower-moving ones,
          so each pair shares a column and the two columns land far
          closer in height than an auto-balanced flow did.

          **`lg:items-start`, not `lg:items-stretch`.** The columns used
          to be force-matched to the taller one's height, with
          `WeightTrend` given `flex-1` to absorb the difference —
          reported once `WeightTrend` had a real chart in it rather than
          the empty-state placeholder it launched with: "weight tracker
          appears clunky due to how large it is... it shouldn't really
          be as much of a focal point as it is here." Stretching a
          two-line log form and a fixed-height chart to fill whatever
          gap `ChallengePass`'s challenge list happens to leave is
          exactly the "taller card with room to spare reads as normal"
          bet the earlier version made, and a real season with several
          challenges listed is what showed it does not read as normal —
          it reads as a chart that swallowed the bottom half of the
          screen. The left column now simply ends where its own content
          ends, the same "not a gap needing to be filled" call the
          Quests page's two columns already make.
        */}
        <div className="min-w-0 space-y-6 lg:grid lg:flex-1 lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-6">
            {/*
              The card names itself and links to the screen, which is
              why nothing here repeats "Buffs" — it had been saying so
              directly over a card whose first line already does.
            */}
            <LimitsCard />

            {/*
              `WeightTrend` replaces `RecentTraining` in this slot,
              asked for directly — "recent training bar graph isn't
              that good, replace it with a weight tracker." See its own
              doc for the history of the domain it reintroduces, and the
              comment above for why it no longer stretches to fill the
              column.
            */}
            <WeightTrend />
          </div>

          <div className="space-y-6">
            {/*
              `TodayGoals` reuses `GoalsToday`/`GoalRow` wholesale —
              see its own doc for why this was a capability the app
              already had and nothing rendered. Silent under the same
              rule as everything else here.
            */}
            <TodayGoals />

            {/*
              **The season names itself inside the card**, keeping the
              name beside the measurement the way this file has
              always insisted. The comment sits *above* the
              conditional rather than inside it, because a JSX comment
              cannot be a bare sibling in a `&&` expression.
            */}
            {season.data !== undefined && (
              <Card>
                <ChallengePass
                  season={{ label: season.data.label, daysLeft: season.data.daysLeft }}
                />
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
