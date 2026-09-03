import { Check, Minus, Plus } from 'lucide-react'

import { Badge, Button, Card } from '@/components/shared/primitives'
import { formatDailyGoal } from '@/domain/backlog/daily-goal'
import type { DailyGoalStatus } from '@/domain/backlog/daily-goals'

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
 * One goal, as a row you can act on. Exported because Today draws these
 * too — a Codex goal is a recurring, cadenced, streak-holding thing that
 * is answered by logging a bit of it, so it belongs in the day's list,
 * and a second copy of this row is where the two screens would start to
 * disagree about what a plus does.
 */
export function GoalRow({ status }: { readonly status: DailyGoalStatus }) {
  const item = status.item
  const log = useLogProgress()

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-ink-50 truncate font-medium">{item.title}</p>
        <p className="text-ink-500 mt-0.5 flex items-center gap-2 text-sm">
          <span>
            {status.loggedToday.toString()} / {status.target.toString()}{' '}
            {formatDailyGoal(status.goal).split(' ').slice(1).join(' ')}
          </span>
          <StreakBadge status={status} />
        </p>
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

export function GoalsToday({ statuses }: { readonly statuses: readonly DailyGoalStatus[] }) {
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

  return (
    <Card className="divide-ink-800 divide-y py-0">
      {statuses.map((status) => (
        <GoalRow key={status.item.id} status={status} />
      ))}
    </Card>
  )
}
