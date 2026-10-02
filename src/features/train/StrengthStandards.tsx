import { Plus, Trophy } from 'lucide-react'

import { useServices, useSettings } from '@/app/context'
import { useQuery } from '@tanstack/react-query'
import { buildCharacter } from '@/domain/game/character'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { AttributeRow } from '@/features/character/CharacterParts'
import { MainLifts } from '@/features/character/MainLifts'
import { Button, Card, CardHeading } from '@/components/shared/primitives'

import { useStartWorkout } from './hooks'

/**
 * Where each lift stands against the published bodyweight standards.
 *
 * It was one half of Train's own screen; the app is one page now and this
 * is a card on it. The rows lead and the lift radar takes the column
 * `lg` frees beside them.
 */
export function StrengthStandards() {
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
      {/*
        **`MainLifts` moved here from `SheetCard`.** Reported: "the
        squat bench deadlift graphic should probably be grouped in the
        training section." It was never a reading of the character
        sheet's own XP the way the portrait, season and traits are —
        it is a strength standard, the same three lifts these rows
        already draw, so drawing it a second time on a different screen
        was the odd one out there. Same "freed width" slot the radar
        has used since it was built: the rows lead, and the radar takes
        the column `lg` and up frees beside them.
      */}
      {/*
        `minmax(0, 1fr)`, not `1fr`: a bare `1fr` will not shrink below
        its rows' min-content, so at ~1280px the fixed radar column pushed
        the card past the page edge and the page scrolled sideways. The
        radar's column shrinks too rather than holding 256px.
      */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,16rem)] lg:items-start lg:gap-6">
        <div className="space-y-3">
          <AttributeRow attribute={character.totalAttribute} emphasis />
          {character.lifts.map((lift) => (
            <AttributeRow key={lift.name} attribute={lift} />
          ))}
        </div>
        <div className="hidden min-w-0 lg:block">
          <MainLifts />
        </div>
      </div>
    </Card>
  )
}

/**
 * A session with no programme day behind it — for the day that does not
 * fit the routine. Like starting the planned one, it does not navigate:
 * the page becomes the player once the workout exists.
 */
export function LogFromScratch() {
  const startWorkout = useStartWorkout()

  return (
    <Button
      variant="outline"
      full
      disabled={startWorkout.isPending}
      onClick={() => {
        startWorkout.mutate(
          { freestyleTitle: 'Open session' },
          {
            onSuccess: () => {
              window.scrollTo({ top: 0 })
            },
          },
        )
      }}
    >
      <Plus size={18} aria-hidden />
      Log a session from scratch
    </Button>
  )
}
