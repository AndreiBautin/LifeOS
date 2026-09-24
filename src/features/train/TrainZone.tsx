import { Dumbbell, History, ListChecks, Plus, Play, SkipForward, Trophy } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { useQuery } from '@tanstack/react-query'
import { buildCharacter } from '@/domain/game/character'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { AttributeRow } from '@/features/character/CharacterParts'
import { clampPosition, dayAt, weekAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'

import {
  useActiveWorkout,
  useExercises,
  usePosition,
  useProgram,
  useSkipSession,
  useStartWorkout,
} from './hooks'
import { SessionOutline, VolumeTargets } from './SessionOutline'

/**
 * Train's at-a-glance content — folded into Today, the same call
 * Quests and Finance already made: *"fold training into it."*
 *
 * **What did not move: the takeover.** `TrainPage` — still mounted at
 * `/train` — keeps its own doc's rule intact: *"an unfinished workout
 * is the only thing that matters until it is finished, and burying it
 * behind a dashboard is how half-logged sessions get lost."* This
 * component never renders `SessionPlayer` or `SessionReport`; it is the
 * plan and the standards, nothing more. Pressing "Start session" here
 * starts the workout and then navigates to `/train`, which is where the
 * full-screen player still lives — Today's multi-zone layout has
 * nowhere to put a screen that is supposed to own the whole viewport.
 *
 * If there is already a workout in progress when this renders, the
 * "Next session" card still shows the *next* one rather than the one
 * under way — that is fine, because `/train` is one tap away
 * (the button below still navigates there) and a person mid-session is
 * not the one reading Today for what to do next.
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
  const program = useProgram()
  const position = usePosition()
  const exercises = useExercises()
  const startWorkout = useStartWorkout()
  const skipSession = useSkipSession()
  const activeWorkout = useActiveWorkout()
  const navigate = useNavigate()

  const here =
    program.data === undefined
      ? undefined
      : clampPosition(program.data, position.data ?? { ...STARTING_POSITION, startedAt: '' })

  const nextDay =
    program.data === undefined || here === undefined ? undefined : dayAt(program.data, here)
  const week =
    program.data === undefined || here === undefined ? undefined : weekAt(program.data, here)

  const alreadyOpen = activeWorkout.data != null

  return (
    <>
      {nextDay !== undefined ? (
        <div>
          <CardHeading
            icon={<Dumbbell size={16} aria-hidden />}
            title="Next session"
            action={
              <>
                <Link to="/program" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                  <ListChecks size={16} aria-hidden />
                  Program
                </Link>
                <Link to="/history" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
                  <History size={16} aria-hidden />
                  History
                </Link>
              </>
            }
          />
          {week?.label !== undefined && <p className="text-ink-500 mb-2 text-sm">{week.label}</p>}
          <Card>
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-ink-50 text-lg font-semibold">{nextDay.label}</h3>
                {nextDay.focus !== undefined && (
                  <p className="text-ink-500 mt-0.5 text-xs">{nextDay.focus}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1.5">
                {week?.isDeload === true && <Badge tone="warn">deload</Badge>}
                <Badge>cycle {here?.cycleNumber ?? 1}</Badge>
              </div>
            </div>

            <SessionOutline day={nextDay} library={exercises.data ?? []} />

            <VolumeTargets day={nextDay} />

            {alreadyOpen ? (
              <Button
                variant="primary"
                size="lg"
                full
                onClick={() => {
                  void navigate('/train')
                }}
              >
                <Play size={20} aria-hidden />
                Resume session
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                full
                disabled={startWorkout.isPending}
                onClick={() => {
                  startWorkout.mutate(undefined, {
                    onSuccess: () => {
                      void navigate('/train')
                    },
                  })
                }}
              >
                <Play size={20} aria-hidden />
                Start session
              </Button>
            )}

            {!alreadyOpen && (
              <Button
                variant="ghost"
                full
                className="mt-2"
                disabled={skipSession.isPending}
                onClick={() => {
                  skipSession.mutate()
                }}
              >
                <SkipForward size={16} aria-hidden />
                {skipSession.isPending ? 'Skipping…' : 'Skip this one'}
              </Button>
            )}
          </Card>
        </div>
      ) : (
        <Empty title="Building your session">
          <p>One moment — the block is put together from your priorities each time.</p>
        </Empty>
      )}

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
    </>
  )
}
