import { ClipboardList, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge, Card, CardHeading, Empty } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { useSettings } from '@/app/context'

import { useExercises, useSessionPreview } from './hooks'
import { SessionOutline } from './SessionOutline'
import { useNextSession } from './useNextSession'

/**
 * What the next session holds — the outline and the volume it is aiming
 * for.
 *
 * **Starting and skipping moved to the hero.** This card carried both
 * buttons while the page opened on a bare wordmark, so the one thing
 * somebody opens a workout tracker to do sat a card's height down the
 * screen. The hero now names the session and starts it; this card is the
 * detail behind the name, which is why it no longer repeats the name as a
 * heading.
 */
export function NextSessionCard() {
  const { day, week, here } = useNextSession()
  const exercises = useExercises()
  const preview = useSessionPreview()
  const { settings } = useSettings()

  if (day === undefined) {
    return (
      <Empty title="Building your session">
        <p>One moment — the week is put together from your routine.</p>
      </Empty>
    )
  }

  return (
    <Card>
      <CardHeading
        icon={<ClipboardList size={16} aria-hidden />}
        title="Session plan"
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
      {/*
        A chip only when it says something: the deload, or a cycle past the
        first. "cycle 1" on its own was a badge describing the default.
      */}
      {(week?.isDeload === true || (here?.cycleNumber ?? 1) > 1) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {week?.isDeload === true && <Badge tone="warn">deload</Badge>}
          {(here?.cycleNumber ?? 1) > 1 && <Badge>cycle {here?.cycleNumber}</Badge>}
        </div>
      )}

      <SessionOutline
        day={day}
        library={exercises.data ?? []}
        planned={preview.data ?? undefined}
        units={settings.units}
      />
    </Card>
  )
}
