import type { Avatar } from '@/domain/game/avatar'
import { SEASON_LABELS, type Season } from '@/domain/game/season'
import { cn } from '@/lib/cn'

/**
 * The character, drawn as what the sheet already knows.
 *
 * **The ring is the level bar.** That is the whole idea: rather than
 * putting a decorative frame around the figure and a progress bar
 * underneath it, the frame *is* the progress — XP into the current level
 * over what the level costs, which is a real denominator rather than a
 * threshold this app invented.
 *
 * The figure is geometric rather than drawn. Two reasons, and the second
 * is the load-bearing one: a minimal silhouette suits a dark, terminal-ish
 * app far better than a pixel-art sprite would, and **there is nothing
 * here to illustrate honestly.** Gear is user-typed titles — "Belt",
 * "Standing desk", anything — so drawing a belt on a character would mean
 * guessing what an upgrade depicts, and guessing wrong on most of them.
 * The items are named beside the portrait instead, which is both truthful
 * and readable.
 */

/**
 * The season tints the ring.
 *
 * Four colours the palette already has, so this adds no new hue and the
 * portrait sits inside the app's existing range rather than beside it.
 */
const SEASON_STROKE: Record<Season, string> = {
  winter: 'var(--color-cool-500)',
  spring: 'var(--color-good-500)',
  summer: 'var(--color-warn-500)',
  autumn: 'var(--color-accent-500)',
}

const SIZE = 120
const CENTRE = SIZE / 2
const RADIUS = 52
const STROKE = 6

export function AvatarPortrait({
  avatar,
  compact = false,
  className,
}: {
  readonly avatar: Avatar
  readonly compact?: boolean
  readonly className?: string
}) {
  const circumference = 2 * Math.PI * RADIUS
  const filled = Math.max(0, Math.min(1, avatar.progress)) * circumference
  const tint = SEASON_STROKE[avatar.season]

  /*
   * The build, clamped rather than trusted. `Avatar` is built by the
   * domain and a stored record cannot reach this — but a band outside
   * the five would silently draw nothing, which is the shape of bug that
   * survives because it does not throw.
   */
  const build = Math.max(0, Math.min(4, Math.round(avatar.build)))

  /* Band 1 onwards. Half the shoulder span, in the SVG's own units. */
  const shoulder = build >= 1 ? 25 : 22

  /*
   * Where the shoulder curve is 6 units in from its outer edge, so a
   * plate lands on the line rather than near it. The shoulders are the
   * upper half of an ellipse `shoulder` wide and 20 tall centred on
   * `CENTRE + 26`, and this is that ellipse solved for y.
   */
  const plateOffset = (shoulder - 6) / shoulder
  const plateY = CENTRE + 26 - 20 * Math.sqrt(Math.max(0, 1 - plateOffset * plateOffset))
  const box = compact ? 56 : SIZE

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: box, height: box }}>
      <svg
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        width={box}
        height={box}
        role="img"
        aria-label={
          /*
           * The whole portrait in one label rather than a decorative
           * `aria-hidden`. Everything it shows is information — level,
           * season, how far through — and a screen reader losing all
           * three because the figure is "just an icon" would be the
           * visual version of a number nobody can reach.
           *
           * It names exactly what is drawn. A derived title used to sit
           * in here too and went with the titles; what replaced it on
           * screen is an ordinary sentence beside the figure, which a
           * screen reader already reaches without help.
           */
          `Level ${String(avatar.level)}, ${SEASON_LABELS[avatar.season]}, ${String(Math.round(avatar.progress * 100))}% through the level`
        }
      >
        <defs>
          <linearGradient id="avatar-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tint} stopOpacity="0.55" />
            <stop offset="100%" stopColor={tint} stopOpacity="1" />
          </linearGradient>
          <radialGradient id="avatar-fill" cx="50%" cy="35%">
            <stop offset="0%" stopColor="var(--color-ink-800)" />
            <stop offset="100%" stopColor="var(--color-ink-900)" />
          </radialGradient>
        </defs>

        <circle cx={CENTRE} cy={CENTRE} r={RADIUS - STROKE} fill="url(#avatar-fill)" />

        {/* The track, so an empty ring reads as "none of it yet" rather
            than as a ring that failed to draw. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="var(--color-ink-800)"
          strokeWidth={STROKE}
        />

        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          fill="none"
          stroke="url(#avatar-ring)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${String(filled)} ${String(circumference)}`}
          /* From the top, clockwise. A ring starting at three o'clock is
             the SVG default and reads as arbitrary. */
          transform={`rotate(-90 ${String(CENTRE)} ${String(CENTRE)})`}
          style={{ filter: `drop-shadow(0 0 4px ${tint})` }}
        />

        {/*
          **The figure grows with the level, and stays a silhouette.**

          It was a head and a pair of shoulders at every level, which is
          what made levelling feel like it moved a numeral and an arc.
          `avatar.build` is the level in five bands and decides how much
          of the below is drawn.

          What it must not become is a *depiction*. The note this
          replaces said anything more specific would be a claim about a
          person, and that still holds: none of these is a face, a body
          type, or an item somebody owns. They are marks of rank on an
          outline — the same reasoning that keeps gear out of the
          portrait, since gear is user-typed titles and drawing one would
          mean guessing what it depicts.
        */}
        <g fill="var(--color-ink-300)">
          <circle cx={CENTRE} cy={CENTRE - 13} r={11} />

          {/* Band 1 widens the shoulders rather than adding to them, so
              the first upgrade changes the outline you already know. */}
          <path
            d={`M ${String(CENTRE - shoulder)} ${String(CENTRE + 26)}
                a ${String(shoulder)} 20 0 0 1 ${String(shoulder * 2)} 0 Z`}
          />
        </g>

        {/*
          Band 2: a mantle, drawn by **stroking the shoulder line the
          figure already has** rather than adding a shape beneath it. The
          first attempt added its own curve below the shoulders and read
          as a detached bowl — the marks have to sit *on* the outline or
          they are a second object sharing the frame.
        */}
        {build >= 2 && (
          <path
            d={`M ${String(CENTRE - shoulder)} ${String(CENTRE + 26)}
                a ${String(shoulder)} 20 0 0 1 ${String(shoulder * 2)} 0`}
            fill="none"
            stroke={tint}
            strokeWidth={4}
            strokeLinecap="round"
          />
        )}

        {/*
          Band 3: plates, sitting on the shoulder line rather than beside
          it — the y is the ellipse solved at that x, so they stay on the
          curve when band 1 widens it. Two rather than one, because a
          single mark reads as an accident of the outline.
        */}
        {build >= 3 && (
          <g fill={tint}>
            <circle cx={CENTRE - shoulder + 6} cy={plateY} r={4} />
            <circle cx={CENTRE + shoulder - 6} cy={plateY} r={4} />
          </g>
        )}

        {/*
          Band 4: an arc above the head. Struck rather than filled, so it
          reads as light rather than as a hat.
        */}
        {build >= 4 && (
          <path
            d={`M ${String(CENTRE - 18)} ${String(CENTRE - 20)}
                a 18 18 0 0 1 36 0`}
            fill="none"
            stroke={tint}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.9}
          />
        )}
      </svg>

      {/* Outside the SVG so it uses the app's own type rather than SVG
          text metrics, which do not respect the user's font settings. */}
      <span
        className={cn(
          'bg-ink-950 text-ink-50 numeric absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border px-2 font-semibold',
          compact ? 'text-[10px]' : 'text-xs',
        )}
        style={{ borderColor: tint }}
      >
        {avatar.level}
      </span>
    </div>
  )
}
