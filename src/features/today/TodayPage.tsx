import { BookMarked, CalendarCheck, Map, Target, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { AgendaItem, Urgency } from '@/application/use-cases/today/agenda'
import { Badge, Card, Empty, Section } from '@/components/shared/primitives'
import { NextAction } from '@/features/projects/NextAction'
import { useRecommendation } from '@/features/projects/hooks'
import { toDayKey } from '@/domain/time/day'
import { useServices } from '@/app/context'

import { Dailies } from './Dailies'
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
  const recommendation = useRecommendation()
  const services = useServices()

  const rows = agenda.data ?? []
  const today = toDayKey(services.clock.now())

  return (
    <>
      <header className="mb-6">
        <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-ink-500 numeric mt-0.5 text-sm">{today}</p>
      </header>

      <Section title="Habits" description="A checkbox and a streak.">
        <Dailies />
      </Section>

      <Section
        title="Next quest"
        description="One thing, and why it is that one."
        action={
          <Link to="/quests" className="text-ink-500 hover:text-ink-300 text-xs">
            All quests
          </Link>
        }
      >
        {recommendation.data === undefined ? (
          <Card>
            <p className="text-ink-500 text-sm">Nothing on the board yet.</p>
          </Card>
        ) : (
          <NextAction recommendation={recommendation.data} />
        )}
      </Section>

      <Section
        title="Wants something"
        description={rows.length === 0 ? undefined : `${rows.length.toString()} across your areas`}
      >
        {rows.length === 0 ? (
          <Empty title="Nothing is due">
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
    </>
  )
}
