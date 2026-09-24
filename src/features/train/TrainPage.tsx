import { useState } from 'react'
import { Navigate } from 'react-router-dom'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'

import { useActiveWorkout, useExercises, useFinishWorkout, useAbandonWorkout } from './hooks'
import { SessionPlayer } from './SessionPlayer'
import { SessionReport } from './SessionReport'

/**
 * `/train` now holds only the takeover, not the dashboard.
 *
 * **The at-a-glance content — Next session, Standards, log-from-scratch
 * — moved to `TrainZone` on Today**, folded in the same way Quests and
 * Finance were: *"fold training into it."* What could not move is the
 * rule this screen's own history already states: *"an unfinished
 * workout is the only thing that matters until it is finished, and
 * burying it behind a dashboard is how half-logged sessions get lost."*
 * Today's multi-zone layout has nowhere to put a screen that needs the
 * whole viewport, so this route still exists for exactly that case —
 * `TrainZone`'s "Start session" button starts the workout and then
 * navigates here.
 *
 * **Redirects to `/today` when neither a workout nor a report is
 * live**, rather than rendering anything of its own. A bare redirect
 * route is the same shape `/quests` and `/finance` already are.
 */
export function TrainPage() {
  const { settings } = useSettings()
  const activeWorkout = useActiveWorkout()
  const exercises = useExercises()
  const finishWorkout = useFinishWorkout()
  const abandonWorkout = useAbandonWorkout()

  const [report, setReport] = useState<WorkoutReport | undefined>(undefined)

  if (report !== undefined) {
    return (
      <SessionReport
        report={report}
        units={settings.units}
        onDismiss={() => {
          setReport(undefined)
        }}
      />
    )
  }

  const workout = activeWorkout.data
  if (workout != null && exercises.data !== undefined) {
    return (
      <SessionPlayer
        workout={workout}
        exercises={exercises.data}
        units={settings.units}
        restSeconds={settings.restTimerEnabled ? 120 : 0}
        keepAwake={settings.keepScreenAwake}
        onFinish={() => {
          finishWorkout.mutate(workout.id, { onSuccess: setReport })
        }}
        onAbandon={() => {
          abandonWorkout.mutate(workout.id)
        }}
      />
    )
  }

  /*
   * Still resolving whether a workout is active — render nothing rather
   * than redirect on a guess, or a page load straight into a session
   * would flash Today before snapping back here.
   */
  if (activeWorkout.isPending) return null

  return <Navigate to="/today" replace />
}
