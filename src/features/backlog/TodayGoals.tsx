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
 */
export function TodayGoals() {
  const goals = useDailyGoals()
  const statuses = goals.data?.statuses ?? []

  if (statuses.length === 0) return null

  return (
    <div>
      <h2 className="text-ink-50 mb-2 font-medium">Working through</h2>
      <GoalsToday statuses={statuses} />
    </div>
  )
}
