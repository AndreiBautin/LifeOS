import { Dumbbell, ListChecks, Play, SkipForward } from 'lucide-react'
import { Link } from 'react-router-dom'

import { clampPosition, dayAt, weekAt } from '@/application/use-cases/programs/current-program'
import { STARTING_POSITION } from '@/domain/programs/position'
import { Badge, Button, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'

import { useExercises, usePosition, useProgram, useSkipSession, useStartWorkout } from './hooks'
import { SessionOutline, VolumeTargets } from './SessionOutline'

/**
 * The next session, in full — day, outline, volume targets, and a way to
 * start or skip it.
 *
 * **Starting does not navigate.** The app is one page, and the page swaps
 * itself for the session player the moment the active-workout query sees
 * an open session — so the only thing left to do here is put the lifter
 * at the top of the screen, where the player begins.
 *
 * **There is no "Resume" state.** While a session is open the page shows
 * the player instead of this card, so the card only ever offers to start.
 * It had a compact variant for a dashboard glance and a Resume button for
 * the screen that sat behind it; neither has anywhere to appear now.
 */
export function NextSessionCard() {
  const program = useProgram()
  const position = usePosition()
  const exercises = useExercises()
  const startWorkout = useStartWorkout()
  const skipSession = useSkipSession()

  const here =
    program.data === undefined
      ? undefined
      : clampPosition(program.data, position.data ?? { ...STARTING_POSITION, startedAt: '' })

  const nextDay =
    program.data === undefined || here === undefined ? undefined : dayAt(program.data, here)
  const week =
    program.data === undefined || here === undefined ? undefined : weekAt(program.data, here)

  if (nextDay === undefined) {
    return (
      <Empty title="Building your session">
        <p>One moment — the block is put together from your priorities each time.</p>
      </Empty>
    )
  }

  return (
    <Card>
      <CardHeading
        icon={<Dumbbell size={16} aria-hidden />}
        title="Next session"
        action={
          <Link
            viewTransition
            to="/program"
            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
          >
            <ListChecks size={16} aria-hidden />
            Program
          </Link>
        }
      />
      {week?.label !== undefined && <p className="text-ink-500 mb-2 text-sm">{week.label}</p>}
      <div>
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

        <Button
          variant="primary"
          size="lg"
          full
          disabled={startWorkout.isPending}
          onClick={() => {
            startWorkout.mutate(undefined, {
              onSuccess: () => {
                window.scrollTo({ top: 0 })
              },
            })
          }}
        >
          <Play size={20} aria-hidden />
          Start session
        </Button>

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
      </div>
    </Card>
  )
}
