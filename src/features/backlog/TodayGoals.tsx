import { BookOpen } from 'lucide-react'

import { Card, CardHeading } from '@/components/shared/primitives'
import { cn } from '@/lib/cn'

import { GoalsToday } from './GoalsToday'
import { useDailyGoals } from './hooks'
import type { DailyGoalStatus } from '@/domain/backlog/daily-goals'

/**
 * The Codex's daily reading/watching goals, drawn on Today.
 *
 * `GoalsToday` already says in its own doc that it was built to be drawn
 * here — *"Today draws these too"* — and nothing did. Added as real
 * content per the direction picked after "still lots of empty space":
 * this reuses `useDailyGoals` and `GoalsToday` wholesale rather than
 * building a second reading of the same board, the same `GoalRow`
 * reasoning that component's own doc already states.
 *
 * **Silent rather than `GoalsToday`'s own empty sentence.** That
 * sentence exists because the Codex is otherwise the only place daily
 * goals are ever mentioned — true on the Codex's own page, and not true
 * here, where every other card on Today is already silent when it has
 * nothing to report. Printing "nothing due today" permanently under a
 * heading would be the one card on this screen that never goes away.
 *
 * **Titled "Working through", not "Goal".** `GoalsCard` a few rows up
 * just gained a `Goal` badge for an entirely different record — a life
 * goal, which pays no XP and has a dependency graph. Reusing the word
 * here, for a reading streak that very much does pay XP, would recreate
 * the exact ambiguity that badge exists to resolve.
 *
 * **One `Card`, not two boxes.** This used to float a bold `h2` above
 * `GoalsToday`'s own separately-bordered card — reported, among the
 * rest of Today's headers, as inconsistent. `GoalsToday` takes a `bare`
 * prop now so its rows can sit inside *this* card, under one
 * `CardHeading`, matching `Buffs` and `Recent training` exactly.
 *
 * **One pip per goal, not a ring.** The first pass gave this the same
 * ring `Base`, the tech tree and the map glances all got too, and it
 * read back correctly: "you literally just added the same visual to
 * all of them." A goal is discrete — met today or not — which is
 * exactly the case `Pips` in `PoolRow` already exists for over a ring:
 * "a half-full bar invites the question of whether that is one and a
 * half coffees; three dots of which one is lit cannot be misread." The
 * same idiom, applied to a different discrete count.
 *
 * **A number sits above the dots now — it didn't at first.** Reported
 * against a screenshot: "three random dots here feel awkward." Fair:
 * every other reading in this family (`CountRing`, `ChallengePass`'s
 * own pass track) pairs the shape with a real number, and this was the
 * one place that shipped the shape alone with only an `aria-label`
 * standing in for it — invisible to anyone not using a screen reader,
 * so a sighted reader saw three dots and nothing telling them what they
 * counted. The fraction is real text now, which is also the better
 * accessibility shape: a visible node a screen reader announces on its
 * own beats a label duplicating what a hidden row of spans meant.
 */
function GoalPips({ statuses }: { readonly statuses: readonly DailyGoalStatus[] }) {
  const met = statuses.filter((status) => status.isMet).length
  const shown = statuses.slice(0, 9)
  const overflow = statuses.length - shown.length

  return (
    <div className="hidden w-14 shrink-0 flex-col items-end gap-1.5 lg:flex">
      <span className="text-ink-500 numeric text-xs">
        {met}/{statuses.length}
      </span>
      <span className="flex flex-wrap justify-end gap-1.5" aria-hidden>
        {shown.map((status) => (
          <span
            key={status.item.id}
            className={cn(
              'h-2.5 w-2.5 rounded-full',
              status.isMet ? 'bg-accent-500' : 'bg-ink-700',
            )}
          />
        ))}
      </span>
      {overflow > 0 && <span className="text-ink-700 numeric text-xs">+{overflow}</span>}
    </div>
  )
}

export function TodayGoals() {
  const goals = useDailyGoals()
  const statuses = goals.data?.statuses ?? []

  if (statuses.length === 0) return null

  return (
    <Card>
      <CardHeading icon={<BookOpen size={16} aria-hidden />} title="Working through" />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <GoalsToday statuses={statuses} bare />
        </div>
        <GoalPips statuses={statuses} />
      </div>
    </Card>
  )
}
