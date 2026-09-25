import { Plus, Trophy } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { useQuery } from '@tanstack/react-query'
import { buildCharacter } from '@/domain/game/character'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { AttributeRow } from '@/features/character/CharacterParts'
import { Button, Card, CardHeading } from '@/components/shared/primitives'

import { useActiveWorkout, useStartWorkout } from './hooks'
import { NextSessionCard } from './NextSessionCard'

/**
 * Train's at-a-glance content — the plan, the standards, and a way to
 * start a session. Rendered by `TrainPage` at `/train` whenever no
 * workout is active.
 *
 * **This briefly lived embedded on Today instead of here**, folded in
 * on *"fold training into it,"* and un-folded once Today had absorbed
 * Quests, Finance and Train all at once and grown taller than a
 * landscape-desktop window could show without shrinking everything
 * illegibly small — see `HomePage`'s own doc for the diagnosis. It is
 * still its own component rather than inlined into `TrainPage`, since
 * nothing about its content changed, only where it is mounted.
 *
 * **What never moved: the takeover.** `TrainPage`'s own rule stays
 * intact: *"an unfinished workout is the only thing that matters until
 * it is finished, and burying it behind a dashboard is how half-logged
 * sessions get lost."* This component never renders `SessionPlayer` or
 * `SessionReport` itself — `TrainPage` decides which of the two to show,
 * and only falls through to this one when neither applies. Pressing
 * "Start session" starts the workout and then navigates to `/train`,
 * which is a no-op route change when this is already mounted there —
 * the workout query refetching is what actually swaps the view to the
 * player.
 *
 * **Next session and Standards sit side by side at `lg`, not stacked.**
 * Reported straight after this page un-folded from Today: "much much
 * better but Train's got some scroll still." Stacked, the page's height
 * is the *sum* of both cards — a full session outline (warm-up through
 * conditioning) plus four standards rows is enough on its own to run
 * past a typical window. Side by side it is the *taller* of the two,
 * which is what actually fits. The same 2-column pairing `HomePage`
 * already uses for its own two cards.
 *
 * **`NextSessionCard` moved out to its own file**, because `HomePage`
 * renders it too now — see that component's own doc for why a glance
 * of it came back to Today. Nothing about its content changed here;
 * only where the JSX lives.
 */
function StrengthStandards() {
  const services = useServices()
  const { settings } = useSettings()

  const workouts = useQuery({
    queryKey: ['workouts', 'all-for-character'],
    queryFn: () => services.workouts.recent(500),
  })

  const completed = (workouts.data ?? []).filter((log) => log.status === 'completed')

  const character = buildCharacter({
    estimatedMaxes: settings.estimatedMaxes,
    ...(settings.bodyweight !== undefined ? { bodyweight: settings.bodyweight } : {}),
    sessions: completed.length,
    workingSets: completed.reduce((total, log) => total + totalWorkingSets(log), 0),
  })

  return (
    <Card>
      <CardHeading icon={<Trophy size={16} aria-hidden />} title="Standards" />
      <div className="space-y-3">
        <AttributeRow attribute={character.totalAttribute} emphasis />
        {character.lifts.map((lift) => (
          <AttributeRow key={lift.name} attribute={lift} />
        ))}
      </div>
    </Card>
  )
}

export function TrainZone() {
  const startWorkout = useStartWorkout()
  const activeWorkout = useActiveWorkout()
  const navigate = useNavigate()

  const alreadyOpen = activeWorkout.data != null

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
      <div className="space-y-6">
        <NextSessionCard />
      </div>

      <div className="space-y-6">
        <StrengthStandards />

        {!alreadyOpen && (
          <Button
            variant="outline"
            full
            disabled={startWorkout.isPending}
            onClick={() => {
              startWorkout.mutate(
                { freestyleTitle: 'Open session' },
                {
                  onSuccess: () => {
                    void navigate('/train')
                  },
                },
              )
            }}
          >
            <Plus size={18} aria-hidden />
            Log a session from scratch
          </Button>
        )}
      </div>
    </div>
  )
}
