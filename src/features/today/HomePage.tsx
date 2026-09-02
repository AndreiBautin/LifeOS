import { Settings } from 'lucide-react'
import { useCampaigns } from '@/features/campaign/hooks'
import { Link } from 'react-router-dom'

import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { LEVELS } from '@/domain/game/character'
import { ActiveQuests } from '@/features/projects/ActiveQuests'
import { useActiveQuests } from '@/features/projects/hooks'
import { LEVEL_TONE } from '@/features/character/sheet-constants'
import { ChallengePass } from '@/features/challenges/ChallengePass'
import { SeasonBand } from '@/features/character/SeasonBand'
import { SheetCard } from '@/features/character/SheetCard'
import { useCharacterSheet, useSeasonProgress } from '@/features/character/hooks'
import { LimitsCard } from '@/features/vitals/LimitsCard'
import { LeadsToday } from '@/features/jobs/LeadsToday'
import { DigestCard } from '@/features/news/DigestCard'

import { Dailies } from './Dailies'

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
 * **The cost is exactly what the old rule predicted, and it is real.**
 * The dailies now sit below three blocks of readout — the portrait, the
 * season and the traits — where they used to sit below two. Opening the
 * app in the morning shows a level before it shows a checkbox. If
 * ticking habits starts feeling like a chore buried under a scoreboard,
 * this ordering is the thing to suspect, and moving `Standing` above
 * `The day` is a two-line change.
 *
 * **What the merge buys, besides the ask.** The navigation drops from
 * eight cells to seven, and eight was over the line on a 320-pixel
 * screen: every cell clears 44px, so eight need 352 and an iPhone SE has
 * 320 — the last tab was clipped by 32 pixels. Seven need 308. The
 * overflow this file warned about is gone rather than worked around.
 *
 * **Three bands, in the order a person moves through them.** A glance at
 * where you are, then the things the day asks for, then the standing
 * that only changes over months. The third band is at the bottom because
 * that is where it was already read from — scrolled to, deliberately,
 * rather than met on the way to a checkbox.
 *
 * **The first band is now one card and no page header.** Asked for as
 * *"let's just drop that entire heading section and just start with the
 * card"*, with the season and the traits merged into it. The page is
 * therefore the only screen in the app with no `PageHeader` — which is
 * a deliberate exception rather than a miss: every other heading says
 * what the screen is, and a portrait of you at the top of a page opened
 * every morning says it without a word. The header's two pieces of
 * information, the level and the date, moved into the card, and its
 * settings link went with them.
 */

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

  /*
   * **The ladders are not on this screen any more, and the traits are
   * bars alone.** Reported: *"let's keep all traits as purely bars to
   * keep it more sleek cause this looks busy."*

   * Each one went to the screen that owns it — the lifts to Train, the
   * money to Finance, the exploration share to the Map — which is why
   * `buildCharacter`, the workouts query and the whole `traitLadders`
   * map came out of here with them. A reading belongs beside the thing
   * it measures and beside the controls that move it; this screen is the
   * glance, and it had been carrying four readings that are acted on
   * elsewhere.
   */

  return (
    /*
      The page owns the rhythm between its blocks, because not every block
      on it is a `Section`.

      `Section` carries its own `mb-8` and every other screen is nothing
      but sections, so the spacing looked like it came from somewhere.
      Today is the one screen that also puts **bare cards** at page level
      — the portrait, the condition, the leads and the digest — and a bare
      card carries no margin at all. So the season heading sat flush
      against the portrait while every other gap on the screen was 2rem,
      which reads as a rendering fault rather than as a group.

      `space-y-8` rather than an `mb-8` on each of the four, because the
      fifth card added here would have the bug again. It cannot
      double-space what is already spaced: a margin utility on the child
      wins over the `:where()` rule this generates, so a section still
      ends 2rem from what follows it and the header still ends 1.5rem
      from what follows it. It reaches exactly the blocks that state
      nothing.
    */
    <div className="space-y-8">
      {/*
        ── The glance ──────────────────────────────────────────────────
        Who you are, the chapter you are in, and the same XP split eight
        ways. One card, because those are one quantity at three
        resolutions rather than three questions. The ring on the portrait
        **is** the XP bar — same numerator, same denominator — so nothing
        in it draws that quantity twice.
      */}
      <SheetCard
        {...(sheet.data === undefined ? {} : { traits: sheet.data.traits })}
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
        ── The day ─────────────────────────────────────────────────────
        **Dailies lead it, and Limits used to.** The old argument for
        Limits first was that they are the most present-tense thing here
        — what you have left right now — and that spending a charge
        happens at an arbitrary moment rather than once in the morning.
        Both halves are still true and neither makes it the thing you
        open the app to do.

        Reported plainly: "can we not have limits at the very top". A
        limit is a *readout you consult before spending*, and the
        checkbox is the thing you came for. So the band runs actions
        first and readouts after, which is the ordering the screen as a
        whole lost when the progression moved above it — restored here at
        the level where it still applies.
      */}
      {/*
        **One section for the whole day.** It began as the habits, took
        the Codex goals when those turned out to be habits in all but
        record type, and then took the deadlines, trips and people when a
        section holding only those was empty most mornings — reported as
        *"I just see an empty due elsewhere now, that's not really
        helpful, why not move everything to where you moved the Codex
        stuff."*

        So the heading is no longer "Dailies": it is the day, and the
        dailies are the largest thing in it. `domain/dailies` keeps its
        name — this is a screen word, the same split Quests keeps over
        `Project`.
      */}
      <Section title="Today" description="Everything the day is asking for.">
        <Dailies />
      </Section>

      <Section title="Active quests" description="One main, one side.">
        <ActiveQuests
          main={active.data?.main}
          side={active.data?.side}
          {...(leadingArc === undefined ? {} : { arc: leadingArc })}
          showLink
        />
      </Section>

      <Section title="Limits" description="What you have left today.">
        <LimitsCard />
      </Section>

      {/* Both silent unless this morning's read found something. */}
      <LeadsToday />
      <DigestCard />

      {/*
        **The season sits below the day now**, asked for as _"I'd move
        season info underneath traits and today."_ That reverses its last
        move, which brought it up into the portrait's own row, and the
        reversal has a reason the earlier arrangement did not: a season
        is the slowest thing on this screen. It changes four times a
        year, where everything above it changes today, and the ordering
        this screen has always argued about — work first, readout last —
        puts the slowest readout at the bottom rather than in the first
        thing you see each morning.

        Above the Areas list and the ladder legend, because those two are
        **navigation and reference** rather than readings. This is still
        something to look at; they are ways to leave.
      */}
      {season.data !== undefined && (
        <Section
          title={season.data.label}
          description={
            season.data.daysLeft > 0
              ? `${String(season.data.daysLeft)} days left`
              : 'The last day of it'
          }
        >
          {/*
            **The pass leads and the XP bar follows.** They are two
            readings of one season and the order says which is being
            worked on: the challenges are a list you act on, the season
            bar is a total that accrues from everything else you did.
            Work first, readout last — the ordering this screen has
            argued about at every level.
          */}
          <Card>
            <ChallengePass />

            {/*
              A rule, because these genuinely are two readings — what you
              have taken up this season, and what the season has earned.
              The sheet card omits one between the portrait and its
              season for the opposite reason: those are one quantity over
              two windows.
            */}
            <div className="border-ink-800 mt-4 border-t pt-4">
              <SeasonBand progress={season.data} />
            </div>
          </Card>
        </Section>
      )}

      {/*
        **The stray-links block is gone.** Reported as _"it just felt
        random having those as stray links while everything else fit
        nicely into a gamified layout"_ — and it was: a row of chips for
        screens whose only shared property was lacking a tab, which is a
        fact about the navigation rather than about the person.

        Each one went where it belongs instead. Resume and Mind hang off
        Job search, which hangs off Quests; Houses off the house-search
        stage of the arc. Every route is now *about* something rather
        than a leftover, which is what the block could never be.
      */}

      <Section title="The ladder">
        <Card>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((level) => (
              <Badge key={level} tone={LEVEL_TONE[level] ?? 'neutral'}>
                {level}
              </Badge>
            ))}
          </div>
          <p className="text-ink-500 mt-3 text-xs">
            Bodyweight multiples in the region of the ExRx and Symmetric Strength tables. They are
            fixed on purpose: a scale the app can move is a scale that means nothing.
          </p>
        </Card>
      </Section>
    </div>
  )
}
