import { getProgressOn } from '@/domain/backlog/daily-goal'
import { isOverdue } from '@/domain/social/circle'
import { OVERDUE_MONTHS } from '@/application/use-cases/social/social'
import { toDayKey } from '@/domain/time/day'
import type {
  BacklogItemRepository,
  Clock,
  FriendRepository,
  ProjectRepository,
  TripRepository,
} from '@/domain/repositories/ports'

/**
 * Everything that wants something from you today, in one list.
 *
 * A calendar and a reminders app answer the same question — "what is due,
 * and when" — and this hub already knew the answer four times over without
 * anybody assembling it: quests carry deadlines, codex entries carry daily
 * goals, trips carry dates, and the party carries how long it has been.
 * They were readable only by opening four screens and doing the comparison
 * yourself.
 *
 * **Nothing here is stored.** There is no event record and no agenda
 * collection — every row is derived from something that already exists and
 * already syncs, which is the same reason the season needs no snapshots.
 * An agenda that had its own copy of a deadline would be a second place
 * for that deadline to be wrong.
 *
 * The cost, stated plainly: this screen can only ever show you what
 * LifeOS already knows. It is not a calendar in the sense of receiving an
 * invitation, and it cannot ring — a PWA has no way to schedule a
 * notification on iOS, so this is somewhere you look rather than something
 * that finds you.
 */

export type Urgency = 'overdue' | 'today' | 'soon'

export interface AgendaItem {
  readonly id: string
  /** Which area it came from, for the icon and the link. */
  readonly area: 'quests' | 'codex' | 'map' | 'party'
  readonly title: string
  /** Why it is on the list — "due Friday", "6 weeks unseen". */
  readonly detail: string
  readonly urgency: Urgency
  readonly href: string
}

export interface AgendaDeps {
  readonly projects: ProjectRepository
  readonly items: BacklogItemRepository
  readonly trips: TripRepository
  readonly friends: FriendRepository
  readonly clock: Clock
}

/** How far ahead counts as worth mentioning. */
const SOON_DAYS = 7

const ORDER: Record<Urgency, number> = { overdue: 0, today: 1, soon: 2 }

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Math.round((end - start) / 86_400_000)
}

/** "today", "tomorrow", "in 4 days", "3 days ago". */
function whenPhrase(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days > 0) return `in ${days.toString()} days`
  if (days === -1) return 'yesterday'
  return `${Math.abs(days).toString()} days ago`
}

function urgencyOf(days: number): Urgency {
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return 'soon'
}

export async function agendaFor(deps: AgendaDeps): Promise<readonly AgendaItem[]> {
  const today = toDayKey(deps.clock.now())

  const [projects, items, trips, friends] = await Promise.all([
    deps.projects.all(),
    deps.items.all(),
    deps.trips.all(),
    deps.friends.all(),
  ])

  const rows: AgendaItem[] = []

  /*
   * Quest deadlines. Finished quests are out — a deadline on something
   * already done is not a thing to be told about, and leaving them in is
   * how an agenda becomes a list people stop reading.
   */
  for (const project of projects) {
    if (project.status === 'completed' || project.deadline === undefined) continue

    const days = daysBetween(today, project.deadline)
    if (days > SOON_DAYS) continue

    rows.push({
      id: `quest:${project.id}`,
      area: 'quests',
      title: project.name,
      detail: `due ${whenPhrase(days)}`,
      urgency: urgencyOf(days),
      href: '/quests',
    })
  }

  /*
   * Codex entries with a daily goal that today has not met yet.
   *
   * Only ones in progress: a goal on something not started is an
   * intention, and listing every book you own as overdue every morning is
   * the fastest way to make this screen worthless.
   */
  for (const item of items) {
    // `currently-using` is the backlog's word for started-but-not-finished
    // — it covers reading, watching and playing without picking one.
    if (item.dailyGoal === undefined || item.status !== 'currently-using') continue

    const done = getProgressOn(item.dailyProgress, today)
    if (done >= item.dailyGoal.amount) continue

    rows.push({
      id: `codex:${item.id}`,
      area: 'codex',
      title: item.title,
      detail: `${(item.dailyGoal.amount - done).toString()} ${item.dailyGoal.unit} left today`,
      urgency: 'today',
      href: '/backlog',
    })
  }

  /*
   * Trips that start soon or are running. A trip already over says
   * nothing; one in progress is worth a line because its places are.
   */
  for (const trip of trips) {
    if (trip.startDate === undefined) continue

    const days = daysBetween(today, trip.startDate)
    const ends = trip.endDate ?? trip.startDate
    const running = trip.startDate <= today && today <= ends

    if (!running && (days < 0 || days > SOON_DAYS)) continue

    rows.push({
      id: `trip:${trip.id}`,
      area: 'map',
      title: trip.name,
      detail: running ? 'on now' : `starts ${whenPhrase(days)}`,
      urgency: running ? 'today' : 'soon',
      href: '/trips',
    })
  }

  /*
   * People you are overdue to see. `isOverdue` owns what overdue means —
   * this asks rather than re-deciding, so the party screen and this one
   * cannot disagree about who is on the list.
   */
  for (const friend of friends) {
    // The threshold is the social use case's, not a second opinion: the
    // party screen and this list must not disagree about who is overdue.
    if (!isOverdue(friend, OVERDUE_MONTHS, today)) continue

    rows.push({
      id: `party:${friend.id}`,
      area: 'party',
      title: friend.name,
      detail: `last seen ${whenPhrase(daysBetween(today, friend.lastHangout))}`,
      urgency: 'overdue',
      href: '/party',
    })
  }

  return rows.sort((a, b) => {
    const byUrgency = ORDER[a.urgency] - ORDER[b.urgency]
    if (byUrgency !== 0) return byUrgency
    return a.title.localeCompare(b.title)
  })
}
