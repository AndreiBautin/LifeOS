import { useServices } from '@/app/context'
import { seasonOf, type Season } from '@/domain/time/season'

/**
 * The slow light behind every screen, tinted by the season you are in.
 *
 * **Always on screen and never asking for attention.** Three soft washes
 * drift over a minute or more, and a dozen faint particles fall or rise in
 * the season's shape. Nothing blinks: the one earlier attempt at motion
 * near the portrait pulsed, and the report was that "the blinking does
 * not look good" — so everything here moves in one direction, slowly, and
 * never changes brightness on a beat.
 *
 * **Colour comes from the palette, not from new hues.** The season picks
 * which of the app's own tokens lead: amber for autumn, violet for winter,
 * green for spring, and warm-and-cyan for summer.
 *
 * **It costs the compositor and nothing else.** Every animation is a
 * `transform` or an `opacity` on its own layer, there is no `filter` and
 * no `backdrop-filter`, and the washes are radial gradients — already
 * soft, so they need no blur. Reduced motion stops the drift and removes
 * the particles outright.
 */

const WASHES: Record<Season, readonly [string, string, string]> = {
  autumn: ['var(--color-warn-500)', 'var(--color-accent-500)', 'var(--color-bad-500)'],
  winter: ['var(--color-cool-500)', 'var(--color-accent-500)', 'var(--color-ink-100)'],
  spring: ['var(--color-good-500)', 'var(--color-accent-500)', 'var(--color-cool-500)'],
  summer: ['var(--color-warn-500)', 'var(--color-accent-500)', 'var(--color-good-500)'],
}

const PARTICLE_COUNT = 14

/**
 * Where each particle starts and how it moves — deterministic, so the
 * field is the same on every render and does not reshuffle when a query
 * lands. Spread by the golden ratio, which scatters evenly without
 * looking like a grid.
 */
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const spread = (index * 0.618_033_988_75) % 1
  return {
    left: `${(spread * 100).toFixed(1)}%`,
    duration: `${String(22 + ((index * 7) % 17))}s`,
    delay: `-${String((index * 5.3) % 30)}s`,
    size: 5 + ((index * 3) % 6),
    sway: `${String(12 + ((index * 11) % 30))}px`,
  }
})

export function AmbientBackdrop() {
  const { clock } = useServices()
  const season = seasonOf(clock.now())
  const [first, second, third] = WASHES[season]

  return (
    <div aria-hidden className="ambient" data-season={season}>
      <div
        className="ambient-wash ambient-wash-a"
        style={{ '--wash': first } as React.CSSProperties}
      />
      <div
        className="ambient-wash ambient-wash-b"
        style={{ '--wash': second } as React.CSSProperties}
      />
      <div
        className="ambient-wash ambient-wash-c"
        style={{ '--wash': third } as React.CSSProperties}
      />
      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          className="ambient-particle"
          style={
            {
              left: particle.left,
              width: particle.size,
              height: particle.size,
              animationDuration: particle.duration,
              animationDelay: particle.delay,
              '--sway': particle.sway,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}
