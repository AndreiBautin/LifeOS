import { Settings } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { WorkoutReport } from '@/application/use-cases/training/finish-workout'
import { useSettings } from '@/app/context'
import { Masonry } from '@/components/shared/Masonry'
import { buttonStyles } from '@/components/shared/styles'
import { ActivityHeatmap } from '@/features/character/ActivityHeatmap'
import { SheetCard } from '@/features/character/SheetCard'
import { TrainingHistory } from '@/features/history/TrainingHistory'
import {
  useAbandonWorkout,
  useActiveWorkout,
  useExercises,
  useFinishWorkout,
} from '@/features/train/hooks'
import { NextSessionCard } from '@/features/train/NextSessionCard'
import { SessionPlayer } from '@/features/train/SessionPlayer'
import { SessionReport } from '@/features/train/SessionReport'
import { LogFromScratch, StrengthStandards } from '@/features/train/StrengthStandards'
import { StrengthTrendCard } from '@/features/train/StrengthTrendCard'

import { SampleNotice } from './SampleNotice'

/**
 * The whole app, on one page.
 *
 * **One page and no navigation bar.** Asked for as _"lets just condense
 * this into one page without a navbar"_, once the app had narrowed to a
 * workout tracker and its three tabs — You, Train, History — were three
 * views of one workout log. The character, the next session, the
 * standards, the trend, the activity grid and the history now read top
 * to bottom; Program and Settings are the only other screens, each a link
 * from a card here with a way back.
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
      <Masonry
        items={[
          {
            key: 'you',
            node: (
              <SheetCard
                avatarSize="large"
                action={
                  <Link
                    viewTransition
                    to="/settings"
                    aria-label="Settings"
                    className={buttonStyles({ variant: 'ghost', size: 'sm' })}
                  >
                    <Settings size={16} aria-hidden />
                  </Link>
                }
              />
            ),
          },
          { key: 'session', node: <NextSessionCard /> },
          { key: 'standards', node: <StrengthStandards /> },
          { key: 'trend', node: <StrengthTrendCard /> },
          { key: 'activity', node: <ActivityHeatmap /> },
        ]}
      />
      <LogFromScratch />
      <TrainingHistory />
    </div>
  )
}
