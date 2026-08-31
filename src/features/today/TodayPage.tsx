import { DigestCard } from '@/features/news/DigestCard'
import { BookMarked, CalendarCheck, Map, Target, Users } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Link } from 'react-router-dom'

import type { AgendaItem, Urgency } from '@/application/use-cases/today/agenda'
import { Badge, Card, Empty, Section } from '@/components/shared/primitives'
import { LeadsToday } from '@/features/jobs/LeadsToday'
import { buttonStyles } from '@/components/shared/styles'
import { ActiveQuests } from '@/features/projects/ActiveQuests'
import { useActiveQuests } from '@/features/projects/hooks'
import { toDayKey } from '@/domain/time/day'
import { useServices } from '@/app/context'

import { Dailies } from './Dailies'
import { SeasonCard } from '@/features/character/SeasonCard'
import { useSeasonProgress } from '@/features/character/hooks'
import { useReviewDraft } from '@/features/review/hooks'
import { LimitsCard, VitalsCard } from '@/features/vitals/VitalsCard'
import { TodayAvatar } from '@/features/character/TodayAvatar'

import { useAgenda } from './hooks'

/**
 * What wants something from you today.
 *
 * This is the closest thing to a calendar and a reminders list that a hub
 * with no server can honestly be. Every row is derived from a record that
 * already exists — a quest deadline, a codex goal, a trip date, somebody
 * you have not seen — so there is no event store, and nothing here can
 * disagree with the screen it came from.
 *
 * It cannot ring. A PWA has no way to schedule a notification on iOS, so
 * this is somewhere you look rather than something that finds you, and it
 * is written to be worth looking at: everything on it is actionable, and
 * anything that is not has been filtered out upstream.
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

export function TodayPage() {
  const agenda = useAgenda()
  const active = useActiveQuests()
  const season = useSeasonProgress()
  const review = useReviewDraft()
  const services = useServices()

  const rows = agenda.data ?? []
  const today = toDayKey(services.clock.now())

  return (
    <>
      {/*
        The portrait sits in the header as a link to the sheet, small and
        without its gear. Today is present tense and a character sheet is
        standing, so what belongs here is the glance — who you are and
        how far through the level — rather than the readout.
      */}
      <PageHeader
        title="Today"
        leading={<TodayAvatar />}
        subtitle={<span className="numeric">{today}</span>}
      />

      {/*
        Limits sit above the dailies because they are the most
        present-tense thing on a present-tense screen — what you have
        left right now — and because spending a charge is the one action
        here that happens at an arbitrary moment rather than once in the
        morning. Vitals follows, being a reading rather than an action.
      */}
      <Section title="Limits" description="What you have left today.">
        <LimitsCard />
      </Section>

      <Section title="Vitals" description="Where the scale is going.">
        <VitalsCard />
      </Section>

      <Section title="Dailies" description="A checkbox and a streak.">
        <Dailies />
      </Section>

      {/*
        The quests you chose, not the one the scoring picked.
        The recommendation still exists and still runs — it lives on the
        Quests page now, as a suggestion for what to activate rather than
        as the answer.
      */}
      <Section title="Active quests" description="One main, one side.">
        <ActiveQuests main={active.data?.main} side={active.data?.side} showLink />
      </Section>

      {/*
        No heading of its own, and silent unless the morning's read of
        the boards found something. A leads card is not a section on this
        screen — it is one line saying whether there is anything to go
        and look at, which is what Today answers about every other area
        too.
      */}
      <LeadsToday />

      {/*
        The digest sits with the leads, below everything the day asks of
        you and above the season. Both are things that arrived overnight
        rather than things you decided to do, and neither pays anything.
      */}
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
        The season sits last, after the work.

        It belongs on this screen rather than on the character sheet —
        which is where it was — because a season is present tense and the
        character sheet is about where you stand overall. But it is a
        readout, not a thing to do, and putting a progress bar above the
        checkboxes would make the first thing you see each morning a score
        rather than a task.
      */}
      {season.data !== undefined && (
        <SeasonCard
          progress={season.data}
          action={
            <Link to="/review" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
              <CalendarCheck size={16} aria-hidden />
              {/*
                Says which month and whether it is done, rather than just
                "Review". A link that cannot tell you there is anything to
                do is a link you stop noticing.
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
    </>
  )
}
