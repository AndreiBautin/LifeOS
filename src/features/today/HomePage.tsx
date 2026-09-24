import { Settings } from 'lucide-react'
import { useCampaigns } from '@/features/campaign/hooks'
import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { ActiveQuests } from '@/features/projects/ActiveQuests'
import { QuestBoard } from '@/features/projects/QuestBoard'
import { useActiveQuests } from '@/features/projects/hooks'
import { Campaigns } from '@/features/campaign/Campaigns'
import { GoalsCard } from '@/features/goals/GoalsCard'
import { TodayGoals } from '@/features/backlog/TodayGoals'
import { ChallengePass } from '@/features/challenges/ChallengePass'
import { SheetCard } from '@/features/character/SheetCard'
import { useCharacterSheet, useSeasonProgress } from '@/features/character/hooks'
import { RecentTraining } from '@/features/train/RecentTraining'
import { LimitsCard } from '@/features/vitals/LimitsCard'

/**
 * One screen: who you are, what today asks, and where you stand.
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
 * **Quests folded in later, for the same kind of reason** — see
 * `QuestBoard`'s own doc.
 *
 * **Zones, not one flat masonry flow.** Every card used to be a direct
 * child of one page-wide `column-width` container, which is what let a
 * quest card, a buff card and a training chart land in adjacent columns
 * with nothing saying they were different kinds of thing. Reported
 * plainly once the width fix landed and there was finally room to see
 * it: *"it seems a little bit disjointed, could we get some headers to
 * organize the sections."*
 *
 * **A header cannot just sit inside the old flow, or it drifts from its
 * own group.** `column-fill:balance` places content by height alone, so
 * a heading and the first card of the group it names could land at the
 * bottom of one column while the rest of the group starts the next —
 * an orphaned label pointing at nothing. Each zone below is its own
 * `<div>` with a heading followed by its *own* nested `column-width`
 * flow, so a zone's cards can only ever land in a column that also
 * holds that zone's heading.
 *
 * **Two zones, not one per card.** `SheetCard`, and each single-card
 * block further down (`LimitsCard`, `RecentTraining`, `TodayGoals`,
 * `ChallengePass`) already open with their own name — "Buffs", "Recent
 * training" — so a zone heading over just one of those would repeat
 * what the card already says. The disjointed feeling was specifically
 * the *Quests* cluster: `ActiveQuests`, `GoalsCard`, `Campaigns` and
 * `QuestBoard` are four to seven differently-named cards with nothing
 * tying them together as one subject, which "Quests" now does. The
 * remaining single-purpose readouts sit under "Today", which is the one
 * grouping word that was missing rather than repeated.
 *
 * **Spacing lives on the outer stack, not on each zone.** `Section`
 * already exists in `primitives.tsx` and was not reused here because it
 * hardcodes its own `mb-8` — stacking that against the outer
 * `space-y-*` this file already uses would double the gap, the same
 * trap this file's own history already records once. `ZoneHeading`
 * carries no margin of its own below the zone; the outer `space-y-10
 * lg:space-y-12` is the only thing deciding the gap between zones.
 */

function ZoneHeading({ children }: { readonly children: string }) {
  return (
    <div
      className="border-ink-800 mb-4 border-l-2 pl-2.5"
      style={{ borderColor: 'var(--color-accent-500)' }}
    >
      <h2 className="text-ink-50 text-lg font-semibold tracking-tight">{children}</h2>
    </div>
  )
}

/*
 * The same masonry recipe the page used to run at top level, now scoped
 * to one zone's cards rather than the whole page. Repeated as a literal
 * class string rather than factored into a shared constant, because
 * Tailwind's own arbitrary-value classes are easiest to grep for when
 * whichever number in them needs to change again — this file has
 * changed `column-width` three times already for reasons fully
 * unrelated to zones.
 */
const ZONE_FLOW =
  'space-y-8 lg:[column-width:22rem] 2xl:[column-width:26rem] lg:gap-10 lg:space-y-0 [&>*]:mb-8 lg:[&>*]:mb-10 [&>*]:break-inside-avoid [&>*]:last:mb-0'

export function HomePage() {
  const active = useActiveQuests()
  /*
   * The first arc with something outstanding. Several arcs are possible
   * and one that is finished has nothing to say about what you are
   * working on now.
   */
  const arcs = useCampaigns()
  const leadingArc = (arcs.data ?? []).find((one) => one.next !== undefined)

  const season = useSeasonProgress()
  const sheet = useCharacterSheet()

  return (
    <div className="space-y-10 lg:space-y-12">
      {/*
        ── The glance ──────────────────────────────────────────────────
        Who you are, the chapter you are in, and the same XP split eight
        ways. One card, because those are one quantity at three
        resolutions rather than three questions. No heading of its own —
        a page that opens on a picture of you does not need to be told
        it is about you, the same call this file has made since the
        page had no header at all.

        **Capped at `lg:max-w-xl`, and set beside "Quests" rather than
        stacked above it.** Both needed a real fix rather than being
        left alone. Pulling `SheetCard` out of the old page-wide
        masonry flow to make room for zones also pulled it out of the
        one thing that had ever bounded its width — a masonry column —
        so with nothing capping it, it stretched to the full page:
        reported as "cap it back to match the other cards' width."
        `xl` (36rem) sits a little wider than a single zone column on
        purpose — this card carries an avatar, `MainLifts` and eight
        trait bars, genuinely more than a Buffs or Recent-training card
        holds, so matching a column exactly would have squeezed it back
        toward the wrapping bug two commits already had to fix.

        **Stacking it above "Quests" full-width also left the entire
        row beside it empty**, reported the very next round: "you have
        to scroll to see everything despite lots of white space on the
        first row." Capping the width fixed how thin the card spread;
        it did nothing about the fact that a capped, standalone block
        no longer shares a row with anything. `lg:flex` puts the two
        side by side instead — `SheetCard` fixed at its own cap on the
        left, the "Quests" zone filling whatever width is left on the
        right — so the freed space actually holds quest cards rather
        than sitting behind the avatar doing nothing.
      */}
      <div className="space-y-10 lg:flex lg:items-start lg:gap-10 lg:space-y-0">
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

        <div className="min-w-0 lg:flex-1">
          <ZoneHeading>Quests</ZoneHeading>
          <div className={ZONE_FLOW}>
            <ActiveQuests
              main={active.data?.main}
              side={active.data?.side}
              {...(leadingArc === undefined ? {} : { arc: leadingArc })}
            />

            {/*
              Silent unless a goal has something available to work on
              next — see the note in `GoalsCard`. A goal is a planning
              surface rather than a quest, so this sits beside the
              quests it is adjacent to in spirit without pretending to
              be one.
            */}
            <GoalsCard />

            {/*
              `Campaigns` is the arc at full size (every stage, every
              lap, editable), which `ActiveQuests`' `ArcSlot` only ever
              summarised. It is a fragment returning one `<Section>`
              per arc, so each arc becomes its own masonry block within
              this zone rather than one giant one.
            */}
            <Campaigns />
            <QuestBoard />
          </div>
        </div>
      </div>

      <div>
        <ZoneHeading>Today</ZoneHeading>
        <div className={ZONE_FLOW}>
          {/*
            The card names itself and links to the screen, which is why
            this zone's heading does not repeat "Buffs" — it had been
            saying so directly over a card whose first line already
            does.
          */}
          <LimitsCard />

          {/*
            `RecentTraining` reads `useRecentWorkouts`, already built for
            the History screen, and is silent under two sessions rather
            than showing a single bar that cannot be a trend.
          */}
          <RecentTraining />

          {/*
            `TodayGoals` reuses `GoalsToday`/`GoalRow` wholesale — see
            its own doc for why this was a capability the app already
            had and nothing rendered. Silent under the same rule as
            everything else here.
          */}
          <TodayGoals />

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
        </div>
      </div>
    </div>
  )
}
