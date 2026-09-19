import { Waypoints } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/shared/primitives'
import { nextAvailableItem } from '@/domain/goals/goal'

import { useGoals } from './hooks'

/**
 * One line per goal with something available to work on next.
 *
 * **A readout, not a quest** — the same stance `ArcSlot` already takes on
 * a campaign standing in for a main quest: nothing here can be activated
 * or closed, and a goal that pays no XP for a decision certainly pays
 * none for merely being read. It bottoms out in the earliest *available*
 * item (`nextAvailableItem`), never a blocked or resolved one, so the
 * line always names something you could actually go and do next rather
 * than the next thing in the list.
 *
 * **Silent unless a goal has something available**, the rule every other
 * readout on this screen already follows — a goal that is fully resolved,
 * fully blocked, or does not exist yet has nothing to say here. Loading
 * falls into the same bucket as "nothing yet" rather than a skeleton, the
 * same call `leadingArc` makes for the campaign slot: this is an optional
 * extra on the day, not a primary control somebody manages from here, and
 * a goal is created from the Quests page header regardless of whether
 * this card has ever shown anything.
 */
export function GoalsCard() {
  const goals = useGoals()

  const rows = (goals.data ?? []).flatMap((standing) => {
    const next = nextAvailableItem(standing)
    return next === undefined ? [] : [{ standing, next }]
  })

  if (rows.length === 0) return null

  return (
    <Card>
      <ul className="divide-ink-800 divide-y">
        {rows.map(({ standing, next }) => (
          <li key={standing.goal.id} className="py-2 first:pt-0 last:pb-0">
            <Link to={`/goals/${standing.goal.id}`} className="flex items-start gap-2">
              <Waypoints size={16} className="text-accent-400 mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-ink-50 truncate text-sm font-medium">{standing.goal.name}</p>
                <p className="text-ink-500 truncate text-xs">Next: {next.item.title}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
