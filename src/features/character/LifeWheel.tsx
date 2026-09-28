import { Card, CardHeading } from '@/components/shared/primitives'
import type { LifeArea } from '@/domain/game/registry'
import { PieChart } from 'lucide-react'

import { useCharacterSheet } from './hooks'

/**
 * The registry's own names are addresses, not copy — `CLAUDE.md` is
 * explicit that the screens and the domain use different words on
 * purpose (Codex over `backlog`, Map over `domain/atlas`, Quests over
 * `Project`), and every other screen already reads three of this
 * legend's entries as Codex, Map and Quests. Reported directly:
 * "Backlog, Mind and Places read a bit awkward," then, checking
 * whether `projects` was secretly `crafting`: it is not — they are
 * two separate areas (`projects`' own acts are "Closed a main quest
 * step"/"Closed a side quest step", the quest log; Crafting is the
 * DIY/Lego area split off from it and already has its own trait bar)
 * — but the same rule that renamed Backlog and Places had been missed
 * on `projects` itself. Mind has no other name anywhere in the app,
 * so it stays; it read oddly at first only because its neighbours
 * hadn't been translated yet.
 */
const DISPLAY_NAME: Partial<Record<LifeArea, string>> = {
  backlog: 'Codex',
  places: 'Map',
  projects: 'Quests',
}

const displayName = (area: { readonly area: string; readonly name: string }): string =>
  DISPLAY_NAME[area.area as LifeArea] ?? area.name

/**
 * Every life area, as one ring — the signature visual this screen was
 * missing. Asked for directly, after a fresh look at Today: *"it needs
 * more diagrams/graphs/charts and ideally one cool unique visual,
 * similar to how we have the spinning DJ record."* Offered as one of a
 * few concrete directions and picked over a muscle heatmap and an
 * orbiting-quests animation: *"directly visualizes the app's actual
 * pitch — one shared model, thirteen areas — and nothing else in the
 * app shows this."*
 *
 * **That last part is true in a way worth stating plainly.** `Traits`
 * already draws a breakdown of this same XP, and looks similar at a
 * glance — but traits stopped partitioning the areas a while back
 * (`UNCLAIMED_AREAS` in `domain/game/traits.ts`), so five areas —
 * Upkeep, Places, Job search, Finance, Challenges — have no trait bar
 * anywhere. This ring reads `sheet.areas` directly rather than through
 * that projection, so it is the only place all thirteen ever appear
 * together.
 *
 * **One hue, not thirteen.** A thirteen-colour legend is exactly the
 * rainbow-dashboard look this app has never had — every other reading
 * here (the level ring, `PercentRing`, `MainLifts`) is the accent
 * colour varying only in how much of it is drawn. This does the same
 * thing by varying opacity instead of drawing angle: the biggest wedge
 * is full accent, the smallest legible one fades toward a third of it.
 *
 * **No percentage is spoken in the centre, on purpose.** A "42% of your
 * XP is Training" sentence is almost exactly the *calling* and the
 * *mainstay* line this app deleted twice over — see `PortraitBand`'s own
 * doc on the XP rule's fold, and `traits.ts`'s history of the flavour
 * titles. The ring shows the proportions; the centre states only the
 * plain total, the same numeral-only stance the level badge already
 * takes.
 */
export function LifeWheel() {
  const sheet = useCharacterSheet()

  if (sheet.data === undefined) return null

  const present = [...sheet.data.areas].filter((area) => area.xp > 0).sort((a, b) => b.xp - a.xp)

  const total = sheet.data.standing.xp

  return (
    <Card>
      <CardHeading icon={<PieChart size={16} aria-hidden />} title="Where the XP came from" />

      {total === 0 ? (
        <p className="text-ink-500 text-sm">Nothing logged yet — this fills in as you go.</p>
      ) : (
        <div className="flex items-center gap-5">
          <Wheel areas={present} total={total} />

          <ul className="min-w-0 flex-1 space-y-1.5">
            {present.slice(0, 6).map((area, index) => (
              <li key={area.area} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--color-accent-500)', opacity: opacityFor(index) }}
                />
                <span className="text-ink-100 min-w-0 flex-1 truncate">{displayName(area)}</span>
                <span className="text-ink-500 numeric shrink-0">
                  {Math.round((area.xp / total) * 100)}%
                </span>
              </li>
            ))}
            {present.length > 6 && (
              <li className="text-ink-600 text-xs">
                +{present.length - 6} more, {sheet.data.areas.length - present.length} not started
              </li>
            )}
          </ul>
        </div>
      )}
    </Card>
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

      <text
        x={CENTRE}
        y={CENTRE - 4}
        textAnchor="middle"
        className="numeric"
        fill="var(--text-primary)"
        fontSize={20}
        fontWeight={600}
      >
        {total.toLocaleString()}
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
