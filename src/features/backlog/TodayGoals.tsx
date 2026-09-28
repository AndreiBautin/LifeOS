import { BookOpen } from 'lucide-react'

import { CountRing } from '@/components/shared/CountRing'
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
 * **How many are met today, as the same `CountRing` `ChallengePass`
 * already draws.** Asked for directly against a screenshot of this
 * card, alongside the tech tree and map glances: "needs the same
 * treatment." The real denominator was already sitting in `statuses` —
 * `status.isMet` per goal — so this is the identical "done of a real
 * total" shape as a challenge finished, not a new reading invented for
 * the occasion.
 */
export function TodayGoals() {
  const goals = useDailyGoals()
  const statuses = goals.data?.statuses ?? []

  if (statuses.length === 0) return null

  const met = statuses.filter((status) => status.isMet).length

  return (
    <Card>
      <CardHeading icon={<BookOpen size={16} aria-hidden />} title="Working through" />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <GoalsToday statuses={statuses} bare />
        </div>
        <CountRing
          done={met}
          total={statuses.length}
          label={`${String(met)} of ${String(statuses.length)} goals met today`}
        />
      </div>
    </Card>
  )
}
