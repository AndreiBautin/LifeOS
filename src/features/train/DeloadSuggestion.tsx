import { BatteryLow } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useServices } from '@/app/context'
import { FATIGUE_STALLS, stalledExercises } from '@/domain/programs/stall'
import { toDayKey } from '@/domain/time/day'
import { Button, Card } from '@/components/shared/primitives'

import { useExercises, useJumpToWeek, useRecentWorkouts } from './hooks'
import { useNextSession } from './useNextSession'

/**
 * **Several lifts stalled at once is fatigue, and the programme already
 * has the answer: its deload week.** When three or more exercises trained
 * lately have each gone three sessions without beating their best
 * (`stalledExercises`), this offers to take the deload now rather than
 * when the calendar reaches it.
 *
 * Offered, never applied — the lifter may know better (a bad week, a
 * cut) — and silent when fewer than three are stuck, when this week is
 * already the deload, or when the block has none. Taking it is
 * `jumpToWeek`, the same write the week picker on the Program page makes.
 */
export function DeloadSuggestion() {
  const today = toDayKey(useServices().clock.now())
  const workouts = useRecentWorkouts(300)
  const exercises = useExercises()
  const { program, thisWeek } = useNextSession()
  const jump = useJumpToWeek()

  if (workouts.data === undefined || program === undefined || thisWeek?.isDeload !== false) {
    return null
  }
  const weeks = program.blocks[0]?.weeks ?? []
  const deload = weeks.findIndex((week) => week.isDeload)
  if (deload === -1) return null

  const stalled = stalledExercises(workouts.data, today)
  if (stalled.length < FATIGUE_STALLS) return null
  const nameOf = (id: string) => exercises.data?.find((one) => one.id === id)?.name ?? id

  return (
    <Card className="border-warn-500/35">
      <p className="text-warn-500 flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
        <BatteryLow size={14} aria-hidden />
        {stalled.length} lifts have stalled
      </p>
      <p className="text-ink-100 mt-2 text-sm">
        {stalled.slice(0, 4).map((id, index) => (
          <span key={id}>
            {index > 0 && ', '}
            <Link
              viewTransition
              to={`/exercise/${id}`}
              className="hover:text-accent-400 underline-offset-2 hover:underline"
            >
              {nameOf(id)}
            </Link>
          </span>
        ))}
        {stalled.length > 4 ? ` and ${String(stalled.length - 4)} more` : ''} — none has beaten its
        best in three sessions. When several stop at once it is usually fatigue rather than any one
        lift.
      </p>
      <Button
        variant="outline"
        full
        className="mt-3"
        disabled={jump.isPending}
        onClick={() => {
          jump.mutate({ program, weekIndex: deload })
        }}
      >
        Take the deload this week
      </Button>
    </Card>
  )
}
