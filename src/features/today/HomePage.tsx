import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { MapGlance } from '@/features/atlas/MapGlance'
import { TodayGoals } from '@/features/backlog/TodayGoals'
import { BaseGlance } from '@/features/base/BaseGlance'
import { useCampaigns } from '@/features/campaign/hooks'
import { ChallengePass } from '@/features/challenges/ChallengePass'
import { SheetCard } from '@/features/character/SheetCard'
import { useCharacterSheet, useSeasonProgress } from '@/features/character/hooks'
import { ActiveQuests } from '@/features/projects/ActiveQuests'
import { useActiveQuests } from '@/features/projects/hooks'
import { NextSessionCard } from '@/features/train/NextSessionCard'
import { NextUpgradeGlance } from '@/features/upgrades/NextUpgradeGlance'
import { LimitsCard } from '@/features/vitals/LimitsCard'

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
 * **The un-fold took the daily glance off Today along with the full
 * board, and that was too much.** Reported directly: *"we completely
 * removed the today's quests stuff from you page... could we make that
 * a full today page where it has working through, similarly it has
 * today's training, quests, etc."* Right — `TodayGoals` had already
 * established the pattern this page runs on: a short daily summary
 * here, the full screen (Codex) elsewhere. Removing `ActiveQuests` and
 * the next session outline along with `QuestBoard` and the rest of
 * `TrainZone` threw the summary out with the board. `ActiveQuests` (the
 * two quest slots) and `NextSessionCard` (shared with `TrainZone`, at
 * full detail rather than a trimmed teaser — asked for that way
 * directly) are both back.
 *
 * **Bringing both back at full size reintroduced scroll, and the fix
 * was to spread the columns rather than trim anything.** Reported
 * plainly against a screenshot: *"seems like there's plenty of
 * whitespace"* — the 2-column pairing below `SheetCard` put
 * `NextSessionCard` and `ChallengePass` in the *same* column, which
 * made that one column by far the page's tallest while `SheetCard`'s
 * own column sat mostly empty underneath it. Two changes, not one:
 * `ActiveQuests` moved into `SheetCard`'s own column, since both are
 * short and "who you are and what you are on" reads as one cluster
 * anyway; and the grid holding the rest went from two columns to
 * three, giving `NextSessionCard` and `ChallengePass` a column each
 * instead of stacking them. Four unevenly-tall blocks in two columns
 * is exactly the `column-fill:balance` failure this file's own history
 * already names; three columns for four blocks is what actually
 * balances them.
 *
 * **Weight came and went within this same page's lifetime.** It sat
 * here briefly as `WeightTrend`, reintroduced this session and then
 * dropped again once a real chart made it "the massive... focal point"
 * of the page rather than the quiet log form it was meant to be. The
 * feature survives on the `weight-tracking` branch; nothing here
 * references it.
 *
 * **Base, the tech tree and the map joined the glance, closing the
 * set.** Asked for directly: *"could we add something from each
 * section to you/today like train/codex have? quests, base status,
 * next upgrade... the goal would be a solid at-a-glance dashboard with
 * the ability to drill into each section."* Train and Codex already had
 * one; Vitals and Quests too. Three sections had no presence here at
 * all, which made "each section" a promise the page did not keep.
 *
 * `BaseGlance`, `NextUpgradeGlance` and `MapGlance` are two lines each
 * — a reading and, where one exists, the next thing worth doing —
 * never the full screen, the same restraint `LimitsCard` and
 * `TodayGoals` already hold. One joined each of the three grid
 * columns rather than opening a fourth, so no column goes from short
 * to empty-looking sparse while another holds four cards.
 */

export function HomePage() {
  const season = useSeasonProgress()
  const sheet = useCharacterSheet()
  const active = useActiveQuests()
  /*
   * The first arc with something outstanding. Several arcs are possible
   * and one that is finished has nothing to say about what you are
   * working on now — the same logic `QuestsPage` runs for the same
   * reason.
   */
  const arcs = useCampaigns()
  const leadingArc = (arcs.data ?? []).find((one) => one.next !== undefined)

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

        **`ActiveQuests` sits under `SheetCard` in the same column, not
        in the grid beside it.** Both are short and both are about the
        person rather than the day's tasks — who you are, and what
        you're on — so stacking them fills the gap that used to sit
        empty below the portrait once the taller columns beside it grew.
      */}
      <div className="space-y-10 lg:flex lg:items-start lg:gap-8 lg:space-y-0">
        <div className="space-y-6 lg:max-w-xl lg:shrink-0">
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

          {/*
            **The two quest slots, same component `QuestsPage` opens
            on.** No heading of its own, matching `LimitsCard` and
            `TodayGoals` in the grid beside it — the cards already say
            what they are. `QuestBoard`, `GoalsCard` and `Campaigns`
            stay on `/quests`; this is the glance, not the board.
          */}
          <ActiveQuests
            main={active.data?.main}
            side={active.data?.side}
            {...(leadingArc === undefined ? {} : { arc: leadingArc })}
          />
        </div>

        {/*
          **Three columns, not two — `NextSessionCard` and
          `ChallengePass` each get their own rather than sharing one.**
          Reported against a screenshot after both came back at full
          size: "seems like there's plenty of whitespace." Pairing them
          in one column made that column run far taller than the other,
          which is the same `column-fill:balance`-style imbalance this
          file's history already names for uneven blocks — the fix
          there was more columns, not less content, and it is the fix
          here too. `LimitsCard` and `TodayGoals` are still short enough
          to share a column between them.

          **`lg:items-start`, not `lg:items-stretch`.** Columns used to
          be force-matched to the tallest one's height, with whichever
          card was shortest given `flex-1` to absorb the difference —
          reported directly as "this is still massive... it shouldn't
          really be as much of a focal point as it is here" once that
          card held real content. No column stretches to match another
          now; each simply ends where its own content ends, the same
          "not a gap needing to be filled" call the Quests page's
          columns already make.
        */}
        <div className="min-w-0 space-y-6 lg:grid lg:flex-1 lg:grid-cols-3 lg:items-start lg:gap-8 lg:space-y-0">
          <div className="space-y-6">
            {/*
              The card names itself and links to the screen, which is
              why nothing here repeats "Buffs" — it had been saying so
              directly over a card whose first line already does.
            */}
            <LimitsCard />

            {/*
              `TodayGoals` reuses `GoalsToday`/`GoalRow` wholesale —
              see its own doc for why this was a capability the app
              already had and nothing rendered. Silent under the same
              rule as everything else here.
            */}
            <TodayGoals />
            <BaseGlance />
          </div>

          <div className="space-y-6">
            {/*
              **The full next-session card, shared with `TrainZone`.**
              Asked for at this depth rather than a trimmed teaser — see
              `NextSessionCard`'s own doc.
            */}
            <NextSessionCard />
            <NextUpgradeGlance />
          </div>

          <div className="space-y-6">
            {/*
              **The season names itself inside the card**, keeping the
              name beside the measurement the way this file has always
              insisted. The comment sits *above* the conditional rather
              than inside it, because a JSX comment cannot be a bare
              sibling in a `&&` expression.
            */}
            {season.data !== undefined && (
              <Card>
                <ChallengePass
                  season={{ label: season.data.label, daysLeft: season.data.daysLeft }}
                />
              </Card>
            )}
            <MapGlance />
          </div>
        </div>
      </div>
    </div>
  )
}
