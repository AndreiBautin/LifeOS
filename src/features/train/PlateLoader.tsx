import type { WeightUnit } from '@/domain/units/weight'
import { PLATES, platesFor, type BarKind } from '@/domain/units/plates'

/**
 * The bar, loaded, for the set you are about to do.
 *
 * **The one thing on this screen nobody else draws.** Between sets the
 * question is never "what is 235" — it is "what do I put on", and that is
 * arithmetic done with chalk on your hands while the rest timer runs. So
 * the player draws the bar from the side with the plates on it, coloured
 * and sized the way plates are in a gym, and slides them on in the order
 * they go on whenever the weight changes. Read it, load it, lift.
 *
 * **Colours follow the competition convention for the unit** — in pounds
 * 45 blue, 35 yellow, 25 green, 10 white; in kilos 25 red, 20 blue, 15
 * yellow, 10 green, 5 white — because those are the colours on the floor
 * of most gyms that colour plates at all, and a picture that disagreed
 * with the rack would be read wrongly.
 *
 * The motion is one-directional and happens once per load, the rule the
 * premium pass set for anything that moves; the global reduced-motion
 * block flattens it like everything else.
 */

const COLOURS: Readonly<Record<WeightUnit, readonly string[]>> = {
  lb: [
    'oklch(0.58 0.17 255)', // 45 blue
    'oklch(0.80 0.15 90)', // 35 yellow
    'oklch(0.62 0.15 150)', // 25 green
    'oklch(0.90 0.01 250)', // 10 white
    'oklch(0.60 0.18 25)', // 5 red
    'oklch(0.84 0.03 80)', // 2.5 chrome
  ],
  kg: [
    'oklch(0.60 0.19 25)', // 25 red
    'oklch(0.58 0.17 255)', // 20 blue
    'oklch(0.80 0.15 90)', // 15 yellow
    'oklch(0.62 0.15 150)', // 10 green
    'oklch(0.90 0.01 250)', // 5 white
    'oklch(0.35 0.01 250)', // 2.5 black
    'oklch(0.84 0.03 80)', // 1.25 chrome
  ],
}

/** Height and thickness by rank in the plate list, heaviest first. */
const HEIGHTS = [74, 68, 60, 46, 36, 30, 26]
const WIDTHS = [16, 14, 12, 9, 7, 6, 5]

const VIEW = { width: 320, height: 82 }
const MID = VIEW.height / 2
const COLLAR_INNER = { left: 112, right: 208 }
const SLEEVE_START = { left: 104, right: 216 }

export function PlateLoader({
  load,
  unit,
  kind = 'barbell',
}: {
  readonly load: number
  readonly unit: WeightUnit
  readonly kind?: BarKind
}) {
  const loading = platesFor(load, unit, kind)
  if (loading === undefined) return null

  const rank = (plate: number) => Math.max(0, PLATES[unit].indexOf(plate))

  // Positions out from the collar, one side; the other side mirrors it.
  const widthOf = (plate: number) => WIDTHS[rank(plate)] ?? 4
  const placed = loading.perSide.map((plate, index) => {
    const r = rank(plate)
    const at = loading.perSide.slice(0, index).reduce((sum, one) => sum + widthOf(one) + 1, 0)
    return {
      plate,
      index,
      width: widthOf(plate),
      height: HEIGHTS[r] ?? 20,
      colour: COLOURS[unit][r],
      at,
    }
  })

  const stack = loading.perSide.reduce((sum, one) => sum + widthOf(one) + 1, 0)

  const perSideText =
    loading.perSide.length === 0 ? 'Empty bar' : loading.perSide.map(String).join(' · ')

  return (
    <figure
      className="border-ink-800 bg-ink-950/50 mt-4 rounded-xl border px-3 pt-2 pb-3"
      aria-label={`${String(load)} ${unit}: a ${String(loading.bar)} ${unit} bar with ${
        loading.perSide.length === 0 ? 'no plates' : `${perSideText} on each side`
      }`}
    >
      <figcaption className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-500 font-semibold tracking-[0.12em] uppercase">Load the bar</span>
        <span className="numeric text-ink-300">
          <span className="text-ink-500">per side </span>
          <span className="text-ink-50 font-semibold">{perSideText}</span>
          {loading.leftover > 0 && <span className="text-warn-500"> +{loading.leftover}</span>}
        </span>
      </figcaption>

      {/* Keyed on the load, so a new weight slides its plates on afresh. */}
      <svg
        key={`${String(load)}-${unit}`}
        viewBox={`0 0 ${String(VIEW.width)} ${String(VIEW.height)}`}
        className="mt-1 w-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="plate-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.28" />
            <stop offset="0.45" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="black" stopOpacity="0.28" />
          </linearGradient>
          <linearGradient id="bar-steel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="oklch(0.82 0.01 250)" />
            <stop offset="1" stopColor="oklch(0.48 0.01 250)" />
          </linearGradient>
        </defs>

        {/* Shaft, sleeves and collars. */}
        <rect
          x="6"
          y={MID - 2.5}
          width={VIEW.width - 12}
          height="5"
          rx="2.5"
          fill="url(#bar-steel)"
        />
        <rect
          x="6"
          y={MID - 4}
          width={SLEEVE_START.left - 2}
          height="8"
          rx="2"
          fill="url(#bar-steel)"
        />
        <rect
          x={SLEEVE_START.right + 2}
          y={MID - 4}
          width={VIEW.width - SLEEVE_START.right - 8}
          height="8"
          rx="2"
          fill="url(#bar-steel)"
        />
        {[COLLAR_INNER.left - 8, COLLAR_INNER.right + 2].map((at) => (
          <rect key={at} x={at} y={MID - 8} width="6" height="16" rx="1.5" fill="url(#bar-steel)" />
        ))}

        {placed.flatMap((one) =>
          (['left', 'right'] as const).map((side) => {
            const plateX =
              side === 'right'
                ? SLEEVE_START.right + 2 + one.at
                : SLEEVE_START.left - 2 - one.at - one.width
            return (
              <g
                key={`${side}-${String(one.index)}`}
                className={side === 'right' ? 'plate-on-right' : 'plate-on-left'}
                style={{ ['--plate-delay' as string]: `${String(80 + one.index * 70)}ms` }}
              >
                <rect
                  x={plateX}
                  y={MID - one.height / 2}
                  width={one.width}
                  height={one.height}
                  rx="2"
                  fill={one.colour}
                  stroke="oklch(0.15 0.01 250)"
                  strokeWidth="0.75"
                />
                <rect
                  x={plateX}
                  y={MID - one.height / 2}
                  width={one.width}
                  height={one.height}
                  rx="2"
                  fill="url(#plate-sheen)"
                />
              </g>
            )
          }),
        )}

        {/* The spring clip goes on last, against the outermost plate. */}
        {placed.length > 0 &&
          (['left', 'right'] as const).map((side) => {
            const clipX =
              side === 'right' ? SLEEVE_START.right + 3 + stack : SLEEVE_START.left - 7 - stack
            return (
              <rect
                key={`clip-${side}`}
                className={side === 'right' ? 'plate-on-right' : 'plate-on-left'}
                style={{
                  ['--plate-delay' as string]: `${String(80 + placed.length * 70)}ms`,
                }}
                x={clipX}
                y={MID - 7}
                width="4"
                height="14"
                rx="1.5"
                fill="var(--color-accent-400)"
              />
            )
          })}
      </svg>
    </figure>
  )
}
