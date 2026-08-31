import { BookMarked, CalendarCheck, Map, Settings, Target, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import type { AgendaItem, Urgency } from '@/application/use-cases/today/agenda'
import { Badge, Card, Empty, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { buildCharacter, LEVELS } from '@/domain/game/character'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { toDayKey } from '@/domain/time/day'
import { useServices, useSettings } from '@/app/context'
import { ActiveQuests } from '@/features/projects/ActiveQuests'
import { useActiveQuests } from '@/features/projects/hooks'
import { AreaCard, AttributeRow } from '@/features/character/CharacterParts'
import { AREA_LINKS, LEVEL_TONE } from '@/features/character/sheet-constants'
import { AvatarCard } from '@/features/character/AvatarCard'
import { CharacterHeader } from '@/features/character/CharacterHeader'
import { Traits } from '@/features/character/Traits'
import { SeasonCard } from '@/features/character/SeasonCard'
import { useCharacterSheet, useSeasonProgress } from '@/features/character/hooks'
import { useReviewDraft } from '@/features/review/hooks'
import { LimitsCard, VitalsCard } from '@/features/vitals/VitalsCard'
import { LeadsToday } from '@/features/jobs/LeadsToday'
import { DigestCard } from '@/features/news/DigestCard'

import { Dailies } from './Dailies'
import { useAgenda } from './hooks'

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
 */

const AREA_ICON = {
  quests: Target,
  codex: BookMarked,
  map: Map,
  party: Users,
} as const

const URGENCY_TONE: Record<Urgency, 'bad' | 'accent' | 'neutral'> = {
  overdue: 'bad',
  today: 'accent',
  soon: 'neutral',
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  today: 'Today',
  soon: 'Soon',
}

function AgendaRow({ item }: { readonly item: AgendaItem }) {
  const Icon = AREA_ICON[item.area]

  return (
    <Link to={item.href} className="hover:bg-ink-850 flex items-center gap-3 rounded-lg px-2 py-2">
      <Icon size={16} className="text-ink-500 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="text-ink-100 block truncate text-sm">{item.title}</span>
        <span className="text-ink-500 block truncate text-xs">{item.detail}</span>
      </span>
      <Badge tone={URGENCY_TONE[item.urgency]}>{URGENCY_LABEL[item.urgency]}</Badge>
    </Link>
  )
}

export function HomePage() {
  const agenda = useAgenda()
  const active = useActiveQuests()
  const season = useSeasonProgress()
  const review = useReviewDraft()
  const sheet = useCharacterSheet()
  const services = useServices()
  const { settings } = useSettings()

  const workouts = useQuery({
    queryKey: ['workouts', 'all-for-character'],
    queryFn: () => services.workouts.recent(500),
  })

  const completed = (workouts.data ?? []).filter((log) => log.status === 'completed')

  const character = buildCharacter({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
    sessions: completed.length,
    workingSets: completed.reduce((total, log) => total + totalWorkingSets(log), 0),
  })

  /*
   * The hub's XP, never training's. `buildCharacter` still computes a
   * training-only level and it is deliberately unused here: two numbers
   * called "level" on one page, disagreeing, is worse than either alone.
   */
  const standing = sheet.data?.standing
  const rows = agenda.data ?? []
  const today = toDayKey(services.clock.now())

  // Training keeps its own section below, which shows real loads rather
  // than the ratios the ladder is scored on.
  const elsewhere = (sheet.data?.areas ?? []).filter((area) => area.area !== 'training')

  return (
    <>
      {/*
        No portrait in the header any more. It was there as a small link
        to the sheet, and the sheet is now the first thing under it —
        two portraits on one screen is one quantity drawn twice.
      */}
      <CharacterHeader
        today={today}
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
        ── The glance ──────────────────────────────────────────────────
        Who you are and where you are in the chapter. The ring on the
        portrait **is** the XP bar — same numerator, same denominator —
        so nothing here draws that quantity twice.
      */}
      <AvatarCard xp={standing?.xp ?? 0} />

      {/*
        The season moved up from the foot of the old Today, because it
        belongs with the progression rather than after the work: it is
        the chapter you are in, which is the same question the level
        answers on a longer scale.
      */}
      {season.data !== undefined && (
        <SeasonCard
          progress={season.data}
          action={
            <Link to="/review" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <CalendarCheck size={16} aria-hidden />
              {/*
                Says which month and whether it is done rather than just
                "Review". A link that cannot tell you there is anything
                to do is a link you stop noticing.
              */}
              {review.data === undefined
                ? 'Review'
                : review.data.started
                  ? `${review.data.month} filed`
                  : `File ${review.data.month}`}
            </Link>
          }
        />
      )}

      {sheet.data !== undefined && (
        <Section title="Traits" description="Your XP, split by what earned it">
          <Traits traits={sheet.data.traits} />
        </Section>
      )}

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
      <Section title="Dailies" description="A checkbox and a streak.">
        <Dailies />
      </Section>

      <Section title="Active quests" description="One main, one side.">
        <ActiveQuests main={active.data?.main} side={active.data?.side} showLink />
      </Section>

      <Section title="Limits" description="What you have left today.">
        <LimitsCard />
      </Section>

      <Section title="Vitals" description="Where the scale is going.">
        <VitalsCard />
      </Section>

      {/* Both silent unless this morning's read found something. */}
      <LeadsToday />
      <DigestCard />

      <Section
        title="Due"
        description={rows.length === 0 ? undefined : `${rows.length.toString()} across your areas`}
      >
        {rows.length === 0 ? (
          <Empty title="Nothing outstanding">
            <span className="inline-flex items-center gap-2">
              <CalendarCheck size={16} aria-hidden />
              No deadlines, no goals outstanding, nobody overdue.
            </span>
          </Empty>
        ) : (
          <Card className="divide-ink-800 divide-y py-0">
            {rows.map((item) => (
              <AgendaRow key={item.id} item={item} />
            ))}
          </Card>
        )}
      </Section>

      {/*
        ── Where you stand ─────────────────────────────────────────────
        Last, and that is not a demotion. These move over months rather
        than mornings, and this is where they were already read from —
        scrolled to on purpose rather than met on the way to a checkbox.
      */}
      <Section title="Strength" description="Squat, bench and deadlift make the total">
        <Card className="space-y-4">
          <AttributeRow attribute={character.totalAttribute} emphasis />
          {character.lifts.map((lift) => (
            <AttributeRow key={lift.name} attribute={lift} />
          ))}
        </Card>
      </Section>

      <Section
        title="Everywhere else"
        description="Levels are measured, ratings are the last monthly judgement"
      >
        {elsewhere.every((area) => area.silent) ? (
          <Card>
            <p className="text-ink-500 text-sm">
              Nothing else has anything to say yet. An area speaks once it has a measurement, a
              recorded rating, or something you did — never before, because a level nobody earned is
              worse than an obvious gap.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {elsewhere
              .filter((area) => !area.silent)
              .map((area) => (
                <AreaCard key={area.area} area={area} />
              ))}
          </div>
        )}
      </Section>

      {/*
        **The screens with no tab, listed so they can be found.**
        Navigation rather than a reading, which is why it repeats none of
        the numbers above.

        It exists because the area cards were the only way in and a
        silent area renders no card: Job search had nothing to say until
        an application existed, and the only route to the screen that
        creates one was the card that could not appear until it did.
      */}
      <Section title="Areas" description="The ones without a tab of their own">
        <Card>
          <div className="flex flex-wrap gap-1.5">
            {AREA_LINKS.map((area) => (
              <Link
                key={area.to}
                to={area.to}
                className={buttonStyles({ variant: 'outline', size: 'sm' })}
              >
                {area.label}
              </Link>
            ))}
          </div>
        </Card>
      </Section>

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
    </>
  )
}
