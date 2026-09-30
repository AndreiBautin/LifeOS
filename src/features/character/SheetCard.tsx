import { useId, type ReactNode } from 'react'

import { CountUp } from '@/components/shared/CountUp'
import { Card, CardHeading } from '@/components/shared/primitives'
import type { LifeArea } from '@/domain/game/registry'
import { PieChart } from 'lucide-react'

import { useCharacterSheet } from './hooks'
import { PortraitBand } from './PortraitBand'
import { Traits } from './Traits'

/**
 * The registry's own names are addresses, not copy — `CLAUDE.md` is
 * explicit that the screens and the domain use different words on
 * purpose (Codex over `backlog`, Map over `domain/atlas`, Quests over
 * `Project`).
 */
const DISPLAY_NAME: Partial<Record<LifeArea, string>> = {
  backlog: 'Codex',
  places: 'Map',
  projects: 'Quests',
}

const displayName = (area: { readonly area: string; readonly name: string }): string =>
  DISPLAY_NAME[area.area as LifeArea] ?? area.name

/**
 * The character sheet, as one card and the first thing on the screen.
 *
 * Asked for in three parts now: *"let's just drop that entire heading
 * section and just start with the card"*, *"merge in the season and
 * attributes stuff into the first card,"* and, against the standalone
 * XP wheel a screen down, *"it makes sense to have the where the xp
 * came from section folded in with the traits and avatar section."*
 * What had been a page header and four stacked blocks is one object.
 *
 * **They are one reading, which is why they merge cleanly.** The level
 * is XP over the whole of your time, the season is XP over this chapter
 * of it, the traits are the same XP split by trait, and the wheel is
 * the same XP again split by area — four resolutions of one quantity,
 * not four separate questions each needing its own heading and 2rem of
 * air.
 *
 * **`MainLifts` left this card the same round the wheel joined it.**
 * Reported: *"the squat bench deadlift graphic should probably be
 * grouped in the training section"* — fair, unlike the three bands that
 * stayed, the lift radar was never a reading *of* this card's own XP;
 * it is a strength standard, the same one `StrengthStandards` on Train
 * already draws as rows, and drawing it twice on two different screens
 * was the odd one out here. It lives on Train now, beside those rows —
 * see that component's own doc.
 *
 * **The cost, and it is the one the page's own note predicted.** This
 * card is tall — a portrait, a disclosure, gear, a season with a meter,
 * a row of trait bars, and now a full XP-by-area wheel — and every one
 * of those sits above the first checkbox of the day. If ticking a habit
 * starts feeling like it is buried, this is the thing to suspect, and
 * the cheapest fix is a fold on a band rather than a section heading
 * back.
 *
 * **A band draws its own name; the card draws none.** There is no title
 * over the portrait, because a page that opens on a picture of you does
 * not need to be told it is about you — and the bands under it say what
 * they are, since a card holding several readings has to.
 *
 * **Reads the sheet itself now, rather than taking `traits` as a
 * prop.** The wheel needs the whole `CharacterSheet` (every area's XP,
 * not just the trait projection of it), so the caller handing over one
 * query's data and this component fetching a second itself would be two
 * copies of the same read. `HomePage` no longer touches
 * `useCharacterSheet` at all.
 */
export function SheetCard({
  action,
  avatarSize,
}: {
  /** The settings link, which used to be the page header's action. */
  readonly action?: ReactNode
  /** Forwarded to `PortraitBand`/`AvatarPortrait`; see its own doc for what `'large'` does. */
  readonly avatarSize?: 'large'
}) {
  const sheet = useCharacterSheet()
  const traits = sheet.data?.traits
  const total = sheet.data?.standing.xp ?? 0
  const present =
    sheet.data === undefined
      ? []
      : [...sheet.data.areas].filter((area) => area.xp > 0).sort((a, b) => b.xp - a.xp)

  return (
    <div className="relative">
      {/*
        **A slow wash behind the card, `lg` and `large` only.** Reported
        after the width and column fixes still left the page "sparse
        with cards": _"I'm thinking more or adding in new UI elements to
        make this app feel more alive and premium."_ This is one of the
        four directions chosen from that reply. It sits *behind* the
        card in DOM order and `-z-10` in paint order, `pointer-events-none`
        so it can never intercept a click meant for the card above it,
        and it is not clipped to the card's own rounded corners — a wash
        that bleeds past the edge reads as ambient light rather than as a
        second, smaller card glowing inside the first.

        **`lg`, not `2xl`** — it shipped at `2xl` and a real two-monitor
        screenshot showed a secondary monitor's window sitting above
        `lg` and below `2xl`, getting none of it. `lg` is the line the
        desktop sidebar nav already switches on.
      */}
      {avatarSize === 'large' && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-10 -z-10 hidden rounded-[2rem] lg:block"
          style={{
            background: 'radial-gradient(60% 60% at 30% 20%, var(--glow-accent), transparent 70%)',
          }}
        >
          <div className="sheet-glow h-full w-full" />
        </div>
      )}

      <Card>
        {/*
          **The figure and its season are one block, with no rule between
          them.** Asked for as _"can we move the season progress up into
          the row with the avatar."_ The season names itself in the column
          beside the portrait and its bar runs full width underneath, which
          is the only place a meter fits: the column next to a 120-pixel
          figure is about 200 wide at 375.

          A rule here would say these are two readings. They are one — the
          level is XP over all of it and the season is XP over this chapter
          — and the traits below still get their rule, because that is
          genuinely the same quantity split a third way.
        */}
        <PortraitBand
          {...(action === undefined ? {} : { action })}
          {...(avatarSize === undefined ? {} : { avatarSize })}
        />

        {traits !== undefined && (
          <div className="border-ink-800 mt-4 border-t pt-4">
            <Traits traits={traits} />
          </div>
        )}

        {/*
          **The signature visual, folded in rather than a card of its
          own.** Asked for directly: "it makes sense to have the where
          the xp came from section folded in with the tributes and
          avatar section." Silent below `total === 0` — a fourth band
          reading "nothing logged yet" under a portrait, a season and a
          row of "Nothing yet" trait bars would be the one thing on this
          card saying the same absence four times.
        */}
        {total > 0 && (
          <div className="border-ink-800 mt-4 border-t pt-4">
            <CardHeading icon={<PieChart size={16} aria-hidden />} title="Where the XP came from" />
            <div className="mt-3 flex items-center gap-5">
              <Wheel areas={present} total={total} />

              <ul className="min-w-0 flex-1 space-y-1.5">
                {present.slice(0, 6).map((area, index) => (
                  <li key={area.area} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: 'var(--color-accent-500)',
                        opacity: opacityFor(index),
                      }}
                    />
                    <span className="text-ink-100 min-w-0 flex-1 truncate">
                      {displayName(area)}
                    </span>
                    <span className="text-ink-500 numeric shrink-0">
                      {Math.round((area.xp / total) * 100)}%
                    </span>
                  </li>
                ))}
                {present.length > 6 && (
                  <li className="text-ink-600 text-xs">
                    +{present.length - 6} more,{' '}
                    {sheet.data === undefined ? 0 : sheet.data.areas.length - present.length} not
                    started
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

/**
 * Full accent for the leading wedge, fading toward a third of it by the
 * time a ring is holding six or more slices — past that the wedges are
 * already too thin to read as separate colours, only as separate
 * widths.
 */
function opacityFor(index: number): number {
  return Math.max(0.32, 1 - index * 0.13)
}

const SIZE = 128
const CENTRE = SIZE / 2
const RADIUS = 50
const STROKE = 16
/** Arc length left blank between wedges, in the same units as the circumference. */
const GAP = 3

function Wheel({
  areas,
  total,
}: {
  readonly areas: readonly { readonly area: string; readonly name: string; readonly xp: number }[]
  readonly total: number
}) {
  const circumference = 2 * Math.PI * RADIUS
  const maskId = useId()

  /*
   * Precomputed rather than mutated inside the render map — a `let`
   * running total reassigned across iterations is a side effect the
   * React compiler refuses across renders, and it is genuinely cleaner
   * as a fold: each segment only needs the sum of the ones before it.
   */
  const segments = areas.reduce<
    {
      readonly area: string
      readonly name: string
      readonly length: number
      readonly dashoffset: number
    }[]
  >((acc, area) => {
    const priorLength = acc.reduce((sum, one) => sum + one.length, 0)
    const length = (area.xp / total) * circumference

    return [...acc, { area: area.area, name: area.name, length, dashoffset: -priorLength }]
  }, [])

  return (
    <svg
      viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
      width={SIZE}
      height={SIZE}
      className="shrink-0"
      role="img"
      aria-label={`XP by area: ${areas.map((a) => `${displayName(a)} ${String(Math.round((a.xp / total) * 100))}%`).join(', ')}`}
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RADIUS}
        fill="none"
        stroke="var(--color-ink-800)"
        strokeWidth={STROKE}
      />

      {/*
        **The wedges are revealed by one sweep rather than drawn one by
        one.** A mask holding a single ring that draws itself round —
        `.ring-draw`, the same animation the level ring uses — so every
        wedge appears in order, clockwise from the top, without each one
        needing its own timing worked out from the ones before it.
      */}
      <mask id={maskId}>
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="white"
          strokeWidth={STROKE + 2}
          className="ring-draw"
          strokeDasharray={`${String(circumference)} ${String(circumference)}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
          style={{ '--ring-full': `${String(circumference)}px` } as React.CSSProperties}
        />
      </mask>

      <g mask={`url(#${maskId})`}>
        {segments.map((segment, index) => {
          /* A sliver too small to carry a gap is drawn solid rather than vanishing. */
          const drawn = segment.length > GAP * 2 ? segment.length - GAP : segment.length

          return (
            <circle
              key={segment.area}
              cx={CENTRE}
              cy={CENTRE}
              r={RADIUS}
              fill="none"
              stroke="var(--color-accent-500)"
              strokeOpacity={opacityFor(index)}
              strokeWidth={STROKE}
              strokeDasharray={`${String(drawn)} ${String(circumference - drawn)}`}
              strokeDashoffset={segment.dashoffset}
              transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
            />
          )
        })}
      </g>

      <text
        x={CENTRE}
        y={CENTRE - 4}
        textAnchor="middle"
        className="numeric"
        fill="var(--text-primary)"
        fontSize={20}
        fontWeight={600}
      >
        <CountUp value={total} as="tspan" />
      </text>
      <text
        x={CENTRE}
        y={CENTRE + 14}
        textAnchor="middle"
        fill="var(--color-ink-600)"
        fontSize={10}
        style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
      >
        XP
      </text>
    </svg>
  )
}
