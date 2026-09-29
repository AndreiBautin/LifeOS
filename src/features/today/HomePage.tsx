import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Masonry } from '@/components/shared/Masonry'
import { Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { MapGlance } from '@/features/atlas/MapGlance'
import { TodayGoals } from '@/features/backlog/TodayGoals'
import { BaseGlance } from '@/features/base/BaseGlance'
import { useCampaigns } from '@/features/campaign/hooks'
import { ChallengePass } from '@/features/challenges/ChallengePass'
import { SheetCard } from '@/features/character/SheetCard'
import { useSeasonProgress } from '@/features/character/hooks'
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
 * **The cards are balanced by measured height, not assigned to columns.**
 * A hand-picked split — the portrait in one column, the readouts in a
 * grid beside it stepping 1 → 2 → 3 by breakpoint — was only ever
 * balanced at the width it was tuned for. At half a desktop screen the
 * readouts fell to one column and ran three times the portrait's height:
 * _"the second column has a lot more content than the first."_ Every
 * earlier fix here (a third column, an 1800px step in `index.css`,
 * moving the quests under the portrait) was re-tuning that split for
 * one more width. `Masonry` takes as many ~360px columns as the width
 * holds and drops each card into the shortest one, so it balances at
 * every width, and on a phone it is the same single stack as before.
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
 * `TodayGoals` already hold.
 */

export function HomePage() {
  const season = useSeasonProgress()
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
    <Masonry
      items={[
        {
          /*
            The portrait and the two quest slots travel as one item, so
            "who you are and what you are on" always opens the first
            column rather than being split by the balancing.
          */
          key: 'you',
          node: (
            <div className="space-y-6">
              <SheetCard
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
              <ActiveQuests
                main={active.data?.main}
                side={active.data?.side}
                {...(leadingArc === undefined ? {} : { arc: leadingArc })}
              />
            </div>
          ),
        },
        { key: 'buffs', node: <LimitsCard /> },
        { key: 'goals', node: <TodayGoals /> },
        { key: 'session', node: <NextSessionCard compact /> },
        {
          key: 'season',
          node:
            season.data === undefined ? null : (
              <Card>
                <ChallengePass
                  season={{ label: season.data.label, daysLeft: season.data.daysLeft }}
                />
              </Card>
            ),
        },
        { key: 'base', node: <BaseGlance /> },
        { key: 'upgrade', node: <NextUpgradeGlance /> },
        { key: 'map', node: <MapGlance /> },
      ]}
    />
  )
}
