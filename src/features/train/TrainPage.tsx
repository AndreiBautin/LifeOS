import { useState } from 'react'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'
import { PageHeader } from '@/components/shared/PageHeader'

import { useActiveWorkout, useExercises, useFinishWorkout, useAbandonWorkout } from './hooks'
import { SessionPlayer } from './SessionPlayer'
import { SessionReport } from './SessionReport'
import { TrainZone } from './TrainZone'

/**
 * `/train` — the takeover when a workout is live, `TrainZone` otherwise.
 *
 * **Un-folded from Today**, reversing "fold training into it": once
 * Quests, Train and Finance had all folded onto one page, that page's
 * natural content height outgrew what any landscape-desktop window
 * could show without either scrolling or shrinking everything to
 * illegible size — see `HomePage`'s own doc for the diagnosis. Splitting
 * back into separate screens is the fix that keeps every screen short
 * enough to read at full size without asking any one of them to hold
 * four zones' worth of content at once.
 *
 * **What never moved: the takeover.** This screen's own history already
 * states the rule — *"an unfinished workout is the only thing that
 * matters until it is finished, and burying it behind a dashboard is how
 * half-logged sessions get lost."* That held true through the fold and
 * holds true now: a `SessionPlayer` or `SessionReport` in progress always
 * wins over `TrainZone`, whatever else is on screen.
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
   * than the dashboard on a guess, or a page load straight into a
   * session would flash the plan before snapping back to the player.
   */
  if (activeWorkout.isPending) return null

  return (
    <div className="space-y-4">
      <PageHeader title="Train" />
      <TrainZone />
    </div>
  )
}
