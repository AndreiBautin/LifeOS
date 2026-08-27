import { useQuery } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { buildCharacter, LEVELS, type Attribute } from '@/domain/game/character'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

/**
 * The lifter as a character sheet.
 *
 * The levels are anchored to published strength standards as multiples of
 * bodyweight, not to an XP curve — "Advanced" has to mean what a coach
 * means by it or the whole screen is decoration. XP sits alongside and
 * rewards turning up, which the strength attributes cannot: strength
 * moves over months, and the app has to say something on a Tuesday.
 *
 * Nothing here is invented when the input is missing. An attribute with
 * no measurement says so rather than showing a plausible zero, because a
 * fabricated level is worse than an obvious gap.
 */

const LEVEL_TONE: Record<string, 'neutral' | 'good' | 'accent' | 'warn'> = {
  Untrained: 'neutral',
  Novice: 'neutral',
  Intermediate: 'good',
  Advanced: 'accent',
  Elite: 'warn',
}

export function CharacterPage() {
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

  const xpFill = Math.round((character.xpIntoLevel / Math.max(1, character.xpForNextLevel)) * 100)

  return (
    <div>
      {/*
        The monthly review is reached from here rather than from the
        navigation, and the cadence is the reason: a screen you open ten
        minutes a month does not earn a permanent tab on a phone. Phase 7
        merges the two properly — this page becomes the readout for every
        area, not only for strength.
      */}
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Character</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            Levels are real standards, as multiples of your bodyweight
          </p>
        </div>
        <Link to="/review" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
          <CalendarCheck size={16} aria-hidden />
          Review
        </Link>
      </header>

      <Section title={`Level ${String(character.xpLevel)}`}>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-300 text-sm">Experience</span>
            <span className="numeric text-ink-50 text-sm font-semibold">
              {character.xpIntoLevel}
              <span className="text-ink-500 font-normal"> / {character.xpForNextLevel}</span>
            </span>
          </div>
          <div className="bg-ink-850 mt-2 h-2 overflow-hidden rounded-full">
            <div
              className="bg-accent-500 h-full rounded-full"
              style={{ width: `${String(xpFill)}%` }}
            />
          </div>
          <p className="text-ink-500 mt-2 text-xs">
            {character.xp} XP all time · 50 for a session, 5 for a working set. XP never moves a
            strength level — showing up and getting stronger are different things.
          </p>
        </Card>
      </Section>

      <Section title="Strength" description="Squat, bench and deadlift make the total">
        <Card className="space-y-4">
          <AttributeRow attribute={character.totalAttribute} emphasis />
          {character.lifts.map((lift) => (
            <AttributeRow key={lift.name} attribute={lift} />
          ))}
        </Card>
      </Section>

      <Section title="The ladder">
        <Card>
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((level) => (
              <Badge key={level} tone={LEVEL_TONE[level] ?? 'neutral'}>
                {level}
              </Badge>
            ))}
          </div>
          <p className="text-ink-500 mt-3 text-xs">
            Bodyweight multiples in the region of the ExRx and Symmetric Strength tables. They are
            fixed on purpose: a scale the app can move is a scale that means nothing.
          </p>
        </Card>
      </Section>
    </div>
  )
}

function AttributeRow({
  attribute,
  emphasis,
}: {
  readonly attribute: Attribute
  readonly emphasis?: boolean
}) {
  const percent = Math.round(attribute.progress * 100)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'text-sm',
            emphasis === true ? 'text-ink-50 font-semibold' : 'text-ink-300 font-medium',
          )}
        >
          {attribute.name}
        </span>
        <div className="flex items-center gap-2">
          {attribute.value !== undefined && (
            <span className="numeric text-ink-50 text-sm font-semibold">
              {String(Math.round(attribute.value))} lb
            </span>
          )}
          <Badge tone={LEVEL_TONE[attribute.level] ?? 'neutral'}>{attribute.level}</Badge>
        </div>
      </div>

      <div className="bg-ink-850 mt-1.5 h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-accent-500 h-full rounded-full"
          style={{ width: `${String(percent)}%` }}
        />
      </div>

      <p className="text-ink-500 mt-1 text-xs">
        {attribute.detail}
        {attribute.next !== undefined &&
          ` · ${String(attribute.next.needed)} lb for ${attribute.next.level}`}
      </p>
    </div>
  )
}
