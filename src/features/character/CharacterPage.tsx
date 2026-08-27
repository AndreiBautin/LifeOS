import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, Settings, Target } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { buildCharacter, LEVELS, type Attribute } from '@/domain/game/character'
import type { RatingOutcome } from '@/domain/game/rating'
import type { AreaStanding } from '@/application/use-cases/character/sheet'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'
import { cn } from '@/lib/cn'

import { NextAction } from '@/features/projects/NextAction'
import { useRecommendation } from '@/features/projects/hooks'

import { SeasonCard } from './SeasonCard'
import { useCharacterSheet, useSeasonProgress } from './hooks'

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

  const sheet = useCharacterSheet()
  const season = useSeasonProgress()
  const recommendation = useRecommendation()

  /*
   * XP is the whole hub's now, not training's. `buildCharacter` still
   * computes a training-only figure and it is deliberately not used here:
   * two numbers called "level" on one page, disagreeing, is worse than
   * either of them alone.
   */
  const standing = sheet.data?.standing
  const xpFill =
    standing === undefined ? 0 : Math.round((standing.into / Math.max(1, standing.needed)) * 100)

  // Training keeps its own section below, which shows real loads in pounds
  // rather than the ratios the ladder is scored on.
  const elsewhere = (sheet.data?.areas ?? []).filter((area) => area.area !== 'training')

  return (
    <div>
      {/*
        The season review is still reached from here rather than from the
        navigation, and the cadence is the reason: a screen you open ten
        minutes a month does not earn a permanent tab on a phone. What
        changed is that this page is now the home screen, so "from here" is
        one tap from anywhere instead of two.
      */}
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-ink-50 text-2xl font-semibold tracking-tight">Character</h1>
          <p className="text-ink-500 mt-0.5 text-sm">
            Where you stand, everywhere it is being tracked
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link to="/review" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            <CalendarCheck size={16} aria-hidden />
            Monthly review
          </Link>
          {/*
            Settings lives here rather than in the navigation, which the
            tech tree took its seat in. Icon-only because the label would
            crowd the review link on a phone, and it is the one destination
            whose icon nobody has to be taught.
          */}
          <Link
            to="/settings"
            aria-label="Settings"
            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
          >
            <Settings size={16} aria-hidden />
          </Link>
        </div>
      </header>

      <Section title={`Level ${String(standing?.level ?? 1)}`}>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-300 text-sm">Experience</span>
            <span className="numeric text-ink-50 text-sm font-semibold">
              {standing?.into ?? 0}
              <span className="text-ink-500 font-normal"> / {standing?.needed ?? 0}</span>
            </span>
          </div>
          <div className="bg-ink-850 mt-2 h-2 overflow-hidden rounded-full">
            <div
              className="bg-accent-500 h-full rounded-full"
              style={{ width: `${String(xpFill)}%` }}
            />
          </div>
          <p className="text-ink-500 mt-2 text-xs">
            {standing?.xp ?? 0} XP all time, across everything you track. Paid for doing the thing,
            never for it having worked — getting stronger moves a ladder, and paying it twice is how
            a number stops being a record of effort.
          </p>
        </Card>
      </Section>

      {season.data !== undefined && <SeasonCard progress={season.data} />}

      {/*
        The one actionable thing on an otherwise reflective screen.
        A home screen you open to admire your levels is a home screen that
        rewards opening the app, which is precisely what the XP model
        refuses to do — so the first thing under the level is what to
        actually go and do.
      */}
      <Section
        title="Next quest"
        description="One thing, and why it is that one."
        action={
          <Link to="/quests" className={buttonStyles({ variant: 'ghost', size: 'sm' })}>
            <Target size={16} aria-hidden />
            All quests
          </Link>
        }
      >
        {recommendation.data === undefined ? (
          <Card>
            <p className="text-ink-500 text-sm">Nothing on the board yet.</p>
          </Card>
        ) : (
          <NextAction recommendation={recommendation.data} />
        )}
      </Section>

      <Section title="Strength" description="Squat, bench and deadlift make the total">
        <Card className="space-y-4">
          <AttributeRow attribute={character.totalAttribute} emphasis />
          {character.lifts.map((lift) => (
            <AttributeRow key={lift.name} attribute={lift} />
          ))}
        </Card>
      </Section>

      <Section
        title="Everywhere else"
        description="Levels are measured, ratings are the last monthly judgement"
      >
        {elsewhere.every((area) => area.silent) ? (
          <Card>
            <p className="text-ink-500 text-sm">
              Nothing else has anything to say yet. An area speaks once it has a measurement, a
              recorded rating, or something you did — never before, because a level nobody earned is
              worse than an obvious gap.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {elsewhere
              .filter((area) => !area.silent)
              .map((area) => (
                <AreaCard key={area.area} area={area} />
              ))}
          </div>
        )}
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

/**
 * What an outcome is worth saying, and how loudly.
 *
 * `insufficient-data` gets no tone at all: it is not a bad result, it is
 * the absence of one, and colouring it would make a second month of
 * tracking look like a setback.
 */
const OUTCOME_LABEL: Record<RatingOutcome, string> = {
  improved: 'Improving',
  regressed: 'Slipping',
  stagnant: 'Flat',
  'insufficient-data': 'Not enough months yet',
}

const OUTCOME_TONE: Record<RatingOutcome, 'good' | 'bad' | 'neutral'> = {
  improved: 'good',
  regressed: 'bad',
  stagnant: 'neutral',
  'insufficient-data': 'neutral',
}

function AreaCard({ area }: { readonly area: AreaStanding }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-ink-50 font-semibold">{area.name}</h3>
        {area.xp > 0 && <span className="numeric text-ink-500 text-xs">{area.xp} XP</span>}
      </div>

      {area.ladders.map((ladder) => (
        <div key={ladder.id}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ink-300 text-sm font-medium">{ladder.name}</span>
            {ladder.reading === undefined ? (
              <span className="text-ink-600 text-xs">Nothing measured yet</span>
            ) : (
              <Badge tone={LEVEL_TONE[ladder.reading.level] ?? 'neutral'}>
                {ladder.reading.level}
              </Badge>
            )}
          </div>

          {ladder.reading !== undefined && (
            <>
              <div className="bg-ink-850 mt-1.5 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-accent-500 h-full rounded-full"
                  style={{ width: `${String(Math.round(ladder.reading.progress * 100))}%` }}
                />
              </div>
              <p className="text-ink-500 mt-1 text-xs">
                {formatLadderValue(ladder.value, ladder.unit)} · anchored to {ladder.anchor}
              </p>
            </>
          )}
        </div>
      ))}

      {area.ratings.map((rating) => (
        <div key={rating.id} className="flex items-baseline justify-between gap-2">
          <span className="text-ink-300 text-sm font-medium">{rating.name}</span>
          <div className="flex items-center gap-2">
            {rating.value !== undefined && (
              <span className="numeric text-ink-500 text-xs">{formatValue(rating.value)}</span>
            )}
            {rating.outcome !== undefined && (
              <Badge tone={OUTCOME_TONE[rating.outcome]}>{OUTCOME_LABEL[rating.outcome]}</Badge>
            )}
          </div>
        </div>
      ))}
    </Card>
  )
}

/** A share reads as a percentage; everything else reads as itself. */
function formatLadderValue(value: number | undefined, unit: string): string {
  if (value === undefined) return unit
  if (unit === 'share of region') {
    const percent = value * 100

    /*
     * Enough decimals to be a number rather than a zero. A single 153-metre
     * square against Greater London is 0.0015%, and one decimal renders
     * that as "0.0%" — which reads as nothing measured, on the one screen
     * whose whole job is to distinguish a small reading from no reading.
     */
    const shown = percent >= 0.1 ? percent.toFixed(1) : percent.toPrecision(2)
    return `${shown}% of the region walked`
  }
  return `${formatValue(value)} ${unit}`
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(2)
}
