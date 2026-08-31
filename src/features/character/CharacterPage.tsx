import { Traits } from './Traits'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/PageHeader'
import { Settings } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useServices, useSettings } from '@/app/context'
import { buildCharacter, LEVELS, type Attribute } from '@/domain/game/character'
import type { RatingOutcome } from '@/domain/game/rating'
import type { AreaStanding } from '@/application/use-cases/character/sheet'
import { totalWorkingSets } from '@/domain/logging/workout-log'
import { Badge, Card, Section } from '@/components/shared/primitives'
import { buttonStyles } from '@/components/shared/styles'

import { Meter } from '@/components/shared/Meter'

import { AvatarCard } from './AvatarCard'
import { cn } from '@/lib/cn'

import { useCharacterSheet } from './hooks'

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

  /*
   * XP is the whole hub's now, not training's. `buildCharacter` still
   * computes a training-only figure and it is deliberately not used here:
   * two numbers called "level" on one page, disagreeing, is worse than
   * either of them alone.
   */
  const standing = sheet.data?.standing

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
      {/*
        Settings lives here rather than in the navigation, which the tech
        tree took its seat in. The monthly review used to sit beside it and
        has moved to Today, next to the season: both answer "how is this
        stretch going", and a link on a screen you open weekly was the only
        prompt to do a thing that wants doing monthly.
      */}
      <PageHeader
        title="Character"
        subtitle="Where you stand, everywhere it is being tracked"
        action={
          <Link
            to="/settings"
            aria-label="Settings"
            className={buttonStyles({ variant: 'ghost', size: 'sm' })}
          >
            <Settings size={16} aria-hidden />
          </Link>
        }
      />

      {/*
        The portrait replaces the bar that used to be here rather than
        sitting above it. The ring **is** the XP bar — same numerator,
        same denominator — and drawing the one quantity twice on one
        screen is how two figures start disagreeing after somebody edits
        one of them.
      */}
      <Section title={`Level ${String(standing?.level ?? 1)}`}>
        <AvatarCard xp={standing?.xp ?? 0} />
      </Section>

      {/*
        Directly under the level, because these are that level split up:
        each area feeds exactly one trait, so the eight bars sum to the
        XP above them. Above the strength ladders on purpose -- this is
        the RPG reading of the whole sheet, and the ladders below are the
        one place a real external standard exists.
      */}
      {sheet.data !== undefined && (
        <Section title="Traits" description="Your XP, split by what earned it">
          <Traits traits={sheet.data.traits} />
        </Section>
      )}

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

      {/*
        **The screens with no tab, listed so they can be found.**
        Navigation, not a reading — which is why it sits outside the
        cards above and repeats none of their numbers.

        It exists because the area cards were the only way in, and a
        silent area renders no card: Job search had nothing to say until
        an application existed, and the only route to the screen that
        creates one was the card that would not appear until it did. A
        link is not a claim about standing, so it can be shown when a
        card cannot.

        The eight in the navigation bar are deliberately absent. These
        are the four that have nowhere else to be reached from — the bar
        is full at eight cells, which was measured: every cell clears
        44px, so nine need 396 and a 375-pixel phone has 375.
      */}
      <Section title="Areas" description="The ones without a tab of their own">
        <Card>
          <div className="flex flex-wrap gap-1.5">
            {[
              { to: '/limits', label: 'Limits' },
              { to: '/vitals', label: 'Vitals' },
              { to: '/jobs', label: 'Job search' },
              { to: '/mind', label: 'Mind' },
              { to: '/finance', label: 'Finance' },
              { to: '/resume', label: 'Resume' },
              { to: '/upgrades', label: 'Tech tree' },
            ].map((area) => (
              <Link
                key={area.to}
                to={area.to}
                className={buttonStyles({ variant: 'outline', size: 'sm' })}
              >
                {area.label}
              </Link>
            ))}
          </div>
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

      <Meter className="mt-1.5" value={percent} of={100} height={6} label={attribute.name} />

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

/**
 * Where each area is actually done, so the hub is a hub.
 *
 * You is the screen that says how every area is going and, until now,
 * the one screen with no way to reach any of them. The routes are here
 * rather than in the registry because `domain/game/` must not know that
 * a browser exists — an area is a way of scoring, and which URL shows it
 * is a fact about this app's front end.
 *
 * Partial on purpose: an area with no screen of its own is a heading and
 * nothing more, which is honest rather than a link that goes nowhere.
 */
const AREA_ROUTES: Partial<Record<string, string>> = {
  training: '/train',
  projects: '/quests',
  backlog: '/backlog',
  upgrades: '/upgrades',
  places: '/map',
  base: '/base',
  vitals: '/vitals',
  dailies: '/today',
  jobs: '/jobs',
  finance: '/finance',
  mind: '/mind',
}

function AreaCard({ area }: { readonly area: AreaStanding }) {
  const to = AREA_ROUTES[area.area]

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        {to === undefined ? (
          <h3 className="text-ink-50 font-semibold">{area.name}</h3>
        ) : (
          <h3 className="font-semibold">
            <Link to={to} className="text-ink-50 hover:text-accent-400">
              {area.name}
            </Link>
          </h3>
        )}
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
              <Meter
                className="mt-1.5"
                value={ladder.reading.progress}
                of={1}
                height={6}
                label={`${ladder.name}, toward the next level`}
              />
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
