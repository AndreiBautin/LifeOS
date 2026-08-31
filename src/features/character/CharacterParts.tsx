import { Link } from 'react-router-dom'

import type { AreaStanding } from '@/application/use-cases/character/sheet'
import { Badge, Card } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { Attribute } from '@/domain/game/character'
import type { RatingOutcome } from '@/domain/game/rating'
import { cn } from '@/lib/cn'

import { AREA_ROUTES, LEVEL_TONE } from './sheet-constants'

/**
 * The pieces the character sheet is made of, on their own.
 *
 * They lived inside `CharacterPage`, which no longer exists: Today and
 * You are one screen now and the sheet is a band on it. Extracted
 * rather than copied, because two implementations of an area card is
 * two places for a rounding rule to drift.
 */
export function AttributeRow({
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

export function AreaCard({ area }: { readonly area: AreaStanding }) {
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
