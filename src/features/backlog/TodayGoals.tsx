import { BookOpen } from 'lucide-react'

import { Card, CardHeading } from '@/components/shared/primitives'

import { GoalsToday } from './GoalsToday'
import { useDailyGoals } from './hooks'

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
 * **No summary visual, and that is a decision rather than an absence.**
 * Two rounds went into a "met/total" pip cluster beside the list — a
 * ring first, then dots with a number added after "three random dots
 * here feel awkward" — and it still read as clutter: *"positioning is
 * still random and it just doesn't really add much."* Right, and worth
 * naming why neither version was going to work. This list holds one to
 * a handful of rows, each already showing its own progress and streak
 * badge, so a count of how many are met today tells you nothing the
 * rows themselves don't already say in the time it takes to glance at
 * three lines. `Base`, `Map` and the tech tree glances earn a compact
 * visual because they compress information that is otherwise
 * invisible on the card; this list has nothing left to compress. Not
 * every card needs the treatment, and forcing one on here was the
 * mistake both earlier rounds were trying to fix in the wrong place.
 *
 * **Only what is due today.** A Mon–Thu game on a Friday is neither met
 * nor missed, and drawing it here beside the one that *is* due made the
 * card claim two sessions were outstanding. The board already counts
 * over `isDueToday`; this is the list agreeing with its own count. The
 * Codex screen keeps every tracked goal, because logging on a day you
 * did not plan to is still allowed there.
 */
export function TodayGoals() {
  const goals = useDailyGoals()
  const statuses = (goals.data?.statuses ?? []).filter((status) => status.isDueToday)

  if (statuses.length === 0) return null

  return (
    <Card>
      <CardHeading icon={<BookOpen size={16} aria-hidden />} title="Working through" />
      <GoalsToday statuses={statuses} bare />
    </Card>
  )
}
