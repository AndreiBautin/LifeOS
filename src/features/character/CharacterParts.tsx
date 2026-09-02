import type { AreaStanding } from '@/application/use-cases/character/sheet'
import { Badge } from '@/components/shared/primitives'
import { Meter } from '@/components/shared/Meter'
import type { Attribute } from '@/domain/game/character'
import { cn } from '@/lib/cn'

import { LEVEL_TONE } from './sheet-constants'

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
 * One ladder, read against its own external standard.
 *
 * **This was the generic half of `AreaCard`, which is gone.** That card
 * drew an area's name, its XP, its ladders and its ratings, and the
 * screen listed one per area under "Everywhere else". Asked for: _"take
 * finance and strength and put those under their corresponding
 * attributes in the section above, and cut the rest out."_
 *
 * So a ladder is now drawn **under the trait that owns its area** — the
 * lifts under Strength, the credit score under Fortune — and the row had
 * to come out of the card to get there. Nothing about the reading
 * changed: a value, a level, a bar to the next one, and the anchor it is
 * measured against, which is the sentence that makes it a ladder rather
 * than a scale this app invented.
 *
 * **The ratings went with the card and nothing is hidden by that.**
 * Filing a month was the only thing that ever recorded one, and that
 * screen was removed the day before, so every rating was already
 * permanently absent. What this deletes is the empty frame around them.
 */
export function LadderRow({ ladder }: { readonly ladder: AreaStanding['ladders'][number] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-ink-300 text-sm font-medium">{ladder.name}</span>
        {ladder.reading === undefined ? (
          <span className="text-ink-600 text-xs">Nothing measured yet</span>
        ) : (
          <Badge tone={LEVEL_TONE[ladder.reading.level] ?? 'neutral'}>{ladder.reading.level}</Badge>
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
  )
}

/** A share reads as a percentage; everything else reads as itself. */
function formatLadderValue(value: number | undefined, unit: string): string {
  if (value === undefined) return unit
  /*
   * An ordinal, because "78.00 percentile" reads as a measurement to two
   * decimal places and it is an interpolation between four published
   * points. Rounded to the whole number it honestly is.
   */
  if (unit === 'percentile for your age') {
    return `${ordinal(Math.round(value))} ${unit}`
  }
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

/** 1st, 2nd, 3rd, 4th — including the teens, which are all "th". */
function ordinal(value: number): string {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) return `${String(value)}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[value % 10] ?? 'th'
  return `${String(value)}${suffix}`
}
