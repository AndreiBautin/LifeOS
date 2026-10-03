import { useState } from 'react'

import { arrangeCards } from '@/domain/settings/home-cards'
import { ArrangeCards } from './ArrangeCards'
import { WhatsNew } from './WhatsNew'
import { DeloadSuggestion } from '@/features/train/DeloadSuggestion'
import { BalanceCard } from '@/features/train/BalanceCard'
import { GoalsCard } from '@/features/train/GoalsCard'
import { withViewTransition } from '@/app/view-transitions'
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
import { LastWeekCard } from '@/features/train/LastWeekCard'
import { NextSessionCard } from '@/features/train/NextSessionCard'
import { SessionPlayer } from '@/features/train/SessionPlayer'
import { SessionReport } from '@/features/train/SessionReport'
import { StrengthStandards } from '@/features/train/StrengthStandards'
import { StrengthTrendCard } from '@/features/train/StrengthTrendCard'
import { WeekCard } from '@/features/train/WeekCard'

import { FirstRunSetup } from './FirstRunSetup'
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
 * this order. The history is one of the cards: it ran full width
 * underneath on the reasoning that a list reads better wide, and on a
 * monitor that made it a stack of empty stripes.
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
        restEnabled={settings.restTimerEnabled}
        keepAwake={settings.keepScreenAwake}
        onFinish={() => {
          /*
           * **The session bar becomes the report's hero.** Both carry the
           * `session-hero` transition name, so finishing grows the slim
           * bar into the panel rather than swapping screens.
           */
          finishWorkout.mutate(workout.id, {
            onSuccess: (finished) => {
              withViewTransition(() => {
                setReport(finished)
                // The report opens at its hero, where the bar was pinned;
                // left at the player's scroll it opened a screen down.
                window.scrollTo(0, 0)
              })
            },
          })
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
      <FirstRunSetup />
      <WhatsNew />
      <HeroBanner />
      <DeloadSuggestion />
      <Masonry
        items={arrangeCards(
          HOME_CARDS.map((card) => card.key),
          settings.homeCards,
        ).flatMap((key) => {
          const card = HOME_CARDS.find((one) => one.key === key)
          return card === undefined ? [] : [{ key, node: card.node }]
        })}
      />
      <ArrangeCards
        defaults={HOME_CARDS.map((card) => card.key)}
        labels={Object.fromEntries(HOME_CARDS.map((card) => [card.key, card.label]))}
      />
    </div>
  )
}

/** The home page's cards in their default order, with the names the arranger shows. */
const HOME_CARDS: readonly {
  readonly key: string
  readonly label: string
  readonly node: React.ReactNode
}[] = [
  { key: 'session', label: 'Next session', node: <NextSessionCard /> },
  { key: 'week', label: 'This week', node: <WeekCard /> },
  { key: 'last-week', label: 'Last week', node: <LastWeekCard /> },
  { key: 'balance', label: 'Balance', node: <BalanceCard /> },
  { key: 'standards', label: 'Strength', node: <StrengthStandards /> },
  { key: 'goals', label: 'Goals', node: <GoalsCard /> },
  { key: 'trend', label: 'Strength over time', node: <StrengthTrendCard /> },
  { key: 'activity', label: 'Training grid', node: <ActivityHeatmap /> },
  { key: 'history', label: 'Recent sessions', node: <TrainingHistory /> },
]
