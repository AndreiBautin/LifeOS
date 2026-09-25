import { Dumbbell, History, ListChecks, Play, SkipForward } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

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
 * The next session, in full — day, outline, volume targets, and a way
 * to start it. Shared between `TrainZone` (at `/train`) and `HomePage`
 * (at `/today`), which is why it takes no props and reads everything
 * through its own hooks the way every other zone-level component here
 * does.
 *
 * **Restored to Today after being removed with the rest of Train's
 * content.** Reported directly once Quests and Train had un-folded to
 * their own pages: *"we completely removed the today's quests stuff
 * from you page... could we make that a full today page where it has
 * working through, similarly it has today's training, quests, etc."*
 * The un-fold was correct — the earlier all-in-one page really was too
 * tall — but it took the *glance* off Today along with the full board,
 * where `TodayGoals` had already established the pattern of keeping a
 * short daily summary on Today while the full screen (Codex, here
 * Train) lives elsewhere. This card is that summary for training,
 * exactly as detailed as Train's own page shows it — asked for at full
 * depth rather than a trimmed teaser.
 *
 * **Pressing "Start session" navigates to `/train`.** From Today that
 * is a real navigation; from `/train` itself, where `TrainZone` also
 * renders this, it is a no-op route change — the workout query
 * refetching is what actually swaps the view to the player either way.
 */
export function NextSessionCard() {
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
      </div>
    </Card>
  )
}
