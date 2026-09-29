import { Check, Minus, Plus } from 'lucide-react'

import { Badge, Button, Card } from '@/components/shared/primitives'
import { formatDailyGoal } from '@/domain/backlog/daily-goal'
import type { DailyGoalDay, DailyGoalStatus } from '@/domain/backlog/daily-goals'
import { cn } from '@/lib/cn'

import { useLogProgress } from './hooks'

/**
 * What is due today, and the two buttons that answer it.
 *
 * The only part of the backlog that belongs on a daily surface, which is
 * why it sits above the list rather than on a page of its own. A goal
 * applies only to something in progress — a goal on a paused item stays
 * configured and stops asking — so this is short by construction.
 */

function StreakBadge({ status }: { readonly status: DailyGoalStatus }) {
  if (status.currentStreak === 0) return null

  return (
    <Badge tone="neutral">
      {status.currentStreak.toString()} day{status.currentStreak === 1 ? '' : 's'}
    </Badge>
  )
}

/**
 * The last fortnight, met or not — `recentDays` on `DailyGoalStatus`,
 * computed for a "history strip" its own doc comment names and drawn by
 * nothing until now. The same shape this file elsewhere calls a
 * capability nothing could reach: `RECENT_DAY_COUNT` and
 * `getRecentDays` have existed, and been tested, since before this card
 * had a single line of visual design.
 *
 * **Bars, not a ring.** `SheetCard` already owns a ring for the XP
 * wheel and `LimitsCard` for a pool's cooldown — a third ring here would
 * be the same shape wearing a different card, not a design that came
 * from what this card actually holds. A streak is a run of *days*, so a
 * strip that reads left to right the way a calendar does is the shape
 * that matches the data instead of the one that was lying around.
 *
 * **Three states, not two.** An off day reads as met in `isMet` — a
 * habit not expected on Sunday should not look broken on Monday — so
 * telling it apart from a day actually logged needs `amount` too, or a
 * book untouched for a week of off-days would draw the same solid strip
 * as one read every day. Missed days are hollow rather than a second
 * colour: this is a glance, not a report, and a bad day should recede
 * rather than compete with today's ring for the eye.
 *
 * `aria-hidden` on the squares and one summary label on the strip —
 * the same split `PoolIconMark` draws between a decorative shape and
 * the sentence that actually says something, except this shape *is*
 * the sentence, so the label carries the counts the text above it does
 * not.
 */
function GoalHistoryStrip({ days }: { readonly days: readonly DailyGoalDay[] }) {
  if (days.length === 0) return null

  const met = days.filter((day) => day.isMet && day.amount > 0).length
  const missed = days.filter((day) => !day.isMet).length

  return (
    <div
      className="mt-2 flex items-center gap-[3px]"
      role="img"
      aria-label={`Last ${days.length.toString()} days: ${met.toString()} met, ${missed.toString()} missed`}
    >
      {days.map((day, index) => {
        const state = day.isMet && day.amount > 0 ? 'met' : day.isMet ? 'off' : 'missed'
        const isToday = index === days.length - 1

        return (
          <span
            key={day.date}
            aria-hidden
            className={cn(
              'h-3.5 w-[5px] shrink-0 rounded-full',
              state === 'met' && 'bg-accent-500',
              state === 'off' && 'bg-ink-850',
              state === 'missed' && 'bg-ink-700',
              isToday && 'ring-accent-300 ring-offset-ink-900 ring-1 ring-offset-1',
            )}
          />
        )
      })}
    </div>
  )
}

/**
 * One goal, as a row you can act on. Exported because Today draws these
 * too — a Codex goal is a recurring, cadenced, streak-holding thing that
 * is answered by logging a bit of it, so it belongs in the day's list,
 * and a second copy of this row is where the two screens would start to
 * disagree about what a plus does.
 *
 * **No category medallion, and one shipped briefly before this.**
 * `CATEGORY_ICONS` was reused from the Codex list the same way
 * `BacklogPage`'s own `ItemRow` uses it, and it read fine in isolation.
 * Measured against the live site rather than trusted: this card's own
 * column is 248px wide at an ordinary 1280px desktop — `HomePage`'s own
 * history already names this grid as "roughly 200px each," and a
 * 36px medallion plus its gap was enough to turn "Frieren: Beyond
 * Journey's End" into "Friere…" and "The Pragmatic Programmer" into
 * "The P…". A shape that costs shared inline width loses to the title
 * it is sitting beside; `GoalHistoryStrip` wraps onto its own line and
 * spends nothing the title needed.
 */
export function GoalRow({ status }: { readonly status: DailyGoalStatus }) {
  const item = status.item
  const log = useLogProgress()

  return (
    <div className="row-hover -mx-2 flex items-center gap-3 px-2 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink-50 truncate font-medium">{item.title}</p>
        <p className="text-ink-500 mt-0.5 flex items-center gap-2 text-sm">
          <span>
            {status.loggedToday.toString()} / {status.target.toString()}{' '}
            {formatDailyGoal(status.goal).split(' ').slice(1).join(' ')}
          </span>
          <StreakBadge status={status} />
        </p>
        <GoalHistoryStrip days={status.recentDays} />
      </div>

      {status.isMet && (
        <Check size={18} className="text-accent-400 shrink-0" aria-label="Met today" />
      )}

      <Button
        variant="ghost"
        size="sm"
        aria-label={`Undo one unit of ${item.title}`}
        disabled={status.loggedToday === 0}
        onClick={() => {
          log.mutate({ id: item.id, delta: -1 })
        }}
      >
        <Minus size={18} aria-hidden />
      </Button>

      <Button
        size="sm"
        aria-label={`Log one unit of ${item.title}`}
        onClick={() => {
          log.mutate({ id: item.id, delta: 1 })
        }}
      >
        <Plus size={18} aria-hidden />
      </Button>
    </div>
  )
}

export function GoalsToday({
  statuses,
  bare = false,
}: {
  readonly statuses: readonly DailyGoalStatus[]
  /**
   * Skips this component's own `Card` wrapper, for a caller that already
   * supplies one — see `TodayGoals`, which wraps this in a `CardHeading`
   * so the heading and the rows share one card boundary instead of a
   * floating title sitting above a separate box.
   */
  readonly bare?: boolean
}) {
  /*
   * **One line rather than a dashed box**, the treatment the empty quest
   * slots got. It drew a full `Empty` — a bordered panel with a title and
   * a sentence — which on a screen whose job is the list below it made
   * the largest thing on the page the part with nothing in it.
   *
   * Kept rather than made silent, unlike Quests' "Suggested". This is the
   * only place in the app that says daily goals exist; a reader who has
   * never set one has no other route to finding out, and the sentence is
   * what tells them where to.
   */
  if (statuses.length === 0) {
    return (
      <p className="text-ink-600 text-sm">
        Nothing due today. Set a daily goal on something you are working through and it appears
        here.
      </p>
    )
  }

  const rows = (
    <div className="divide-ink-800 divide-y">
      {statuses.map((status) => (
        <GoalRow key={status.item.id} status={status} />
      ))}
    </div>
  )

  if (bare) return rows

  return <Card className="py-0">{rows}</Card>
}
