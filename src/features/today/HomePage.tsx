import { useState } from 'react'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'
import { Masonry } from '@/components/shared/Masonry'
import { TrainingHistory } from '@/features/history/TrainingHistory'
import {
  useAbandonWorkout,
  useActiveWorkout,
  useExercises,
  useFinishWorkout,
} from '@/features/train/hooks'
import { ActivityHeatmap } from '@/features/train/ActivityHeatmap'
import { NextSessionCard } from '@/features/train/NextSessionCard'
import { SessionPlayer } from '@/features/train/SessionPlayer'
import { SessionReport } from '@/features/train/SessionReport'
import { StrengthStandards } from '@/features/train/StrengthStandards'
import { StrengthTrendCard } from '@/features/train/StrengthTrendCard'
import { WeekCard } from '@/features/train/WeekCard'

import { HeroBanner } from './HeroBanner'
import { SampleNotice } from './SampleNotice'

/**
 * The whole app, on one page.
 *
 * **One page and no navigation bar.** Asked for as _"lets just condense
 * this into one page without a navbar"_, once the app's tabs had become
 * three views of one workout log. The next session, strength, the trend,
 * the training grid and the history read top to bottom; Program and
 * Settings are the only other screens, each a link from here with a way
 * back.
 *
 * **It opens on the hero**, which names the next session and starts it.
 * It was a portrait and a level while the app was a game, then a bare
 * "LiftOS" over a gear — and in both the session you came to start sat
 * a card's height down. See `HeroBanner`.
 *
 * **The takeover is the rule that survived every arrangement.** An
 * unfinished workout is the only thing that matters until it is
 * finished, and burying it behind a dashboard is how half-logged
 * sessions get lost — so while one is open this page *is* the session
 * player, and after finishing it is the report until dismissed. Starting
 * a session therefore needs no navigation: the active-workout query
 * refetches and the page swaps itself.
 *
 * **The cards are balanced by measured height, not assigned to columns.**
 * `Masonry` takes as many ~360px columns as the width holds and drops
 * each card into the shortest one; on a phone it is a single stack in
 * this order. The history runs full width underneath, because a list of
 * sessions is the one thing here that reads better wide than tall.
 */
export function HomePage() {
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
   * than the dashboard on a guess, or a page load straight into a session
   * would flash the plan before snapping back to the player.
   */
  if (activeWorkout.isPending) return null

  return (
    <div className="space-y-6">
      <SampleNotice />
      <HeroBanner />
      <Masonry
        items={[
          { key: 'session', node: <NextSessionCard /> },
          { key: 'week', node: <WeekCard /> },
          { key: 'standards', node: <StrengthStandards /> },
          { key: 'trend', node: <StrengthTrendCard /> },
          { key: 'activity', node: <ActivityHeatmap /> },
        ]}
      />
      <TrainingHistory />
    </div>
  )
}
