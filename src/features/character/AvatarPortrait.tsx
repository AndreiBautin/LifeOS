import type { Avatar } from '@/domain/game/avatar'
import { SEASON_LABELS, type Season } from '@/domain/game/season'
import { cn } from '@/lib/cn'

import { FIGURES } from './figures'

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

/*
 * **The box is a Tailwind class now, not an inline `style` object** —
 * the same fix `AppShell.tsx` needed for the same reason: an inline
 * style always beats a class regardless of breakpoint, so a responsive
 * `2xl:` size could never have taken effect while `style={{ width: box
 * }}` sat on the same element. The SVG's own `viewBox` stays fixed at
 * `0 0 120 120` throughout — that is what lets the rendered box grow at
 * `large` with nothing inside it needing to be recomputed.
 */
const BOX_CLASSES = {
  compact: 'h-14 w-14',
  default: 'h-[120px] w-[120px]',
  /*
   * **Only this variant is responsive, and only one screen asks for
   * it.** Today's `SheetCard` sits beside a lot of freed width once the
   * masonry grid has more room than its own content needs — reported as
   * "looks sparse with cards" — and the figure this app already draws
   * for every level is the one thing on the page that is decoration
   * *and* real information, the same reasoning behind Spinner's vinyl
   * record. Every other caller keeps the fixed 120px it always had.
   *
   * **`lg`, not `2xl`.** It shipped gated at `2xl` first and a real
   * two-monitor screenshot showed why that was wrong: a secondary
   * monitor's browser window sits well above `lg` and well below `2xl`,
   * so the whole "large" treatment — this box, the radar, the sheet
   * glow — simply never appeared there. `lg` is the same line the
   * sidebar nav already switches on, so anything wide enough for the
   * desktop nav is wide enough for this too.
   *
   * **There is no `2xl` step, and there was one for one round.** It grew
   * this box to 300px, which left almost no width for the "Level N" /
   * XP column beside it in the ~350–450px masonry column this actually
   * renders inside — reported plainly as "this ruined it... there's a
   * lot of overlap," visible as "Level" and "4" wrapping onto separate
   * lines. Growing an element without checking it against the column
   * width it actually has to share is exactly the trap this file
   * already names for fixed pixel breakpoints; reverted rather than
   * re-tuned, because the failure mode (text wrapping inside a shrunk
   * column) would recur at any second size step chosen the same way.
   */
  large: 'h-[120px] w-[120px] lg:h-[220px] lg:w-[220px]',
} as const

export function AvatarPortrait({
  avatar,
  compact = false,
  size,
  className,
}: {
  readonly avatar: Avatar
  readonly compact?: boolean
  /** `'large'` grows the rendered box at `2xl`; omitted keeps the fixed size every other screen uses. */
  readonly size?: 'large'
  readonly className?: string
}) {
  const circumference = 2 * Math.PI * RADIUS
  const filled = Math.max(0, Math.min(1, avatar.progress)) * circumference
  const tint = SEASON_STROKE[avatar.season]
  const boxClass =
    size === 'large' ? BOX_CLASSES.large : compact ? BOX_CLASSES.compact : BOX_CLASSES.default

  /*
   * The build, clamped rather than trusted. `Avatar` is built by the
   * domain and a stored record cannot reach this — but a band outside
   * the five would silently draw nothing, which is the shape of bug that
   * survives because it does not throw.
   */
  const build = Math.max(0, Math.min(4, Math.round(avatar.build)))

  /*
   * Falls back to the first rather than to nothing: a band with no
   * figure would draw an empty disc, which looks like a load that never
   * finished rather than like a bug.
   */
  const figure = FIGURES[build] ?? FIGURES[0]
  if (figure === undefined) return null

  /*
   * **The figure takes the season tint from band 2**, where the plain
   * and hooded ones stay the app's own grey. It is a second axis of
   * escalation for nothing: the outline changes at every band, and
   * somewhere in the middle you also stop being drawn in the colour of
   * furniture.
   */
  const figureFill = build >= 2 ? tint : 'var(--color-ink-300)'

  /*
   * Inside the ring's own track, with a little air. In viewBox units,
   * which is what lets the rendered box grow at `large` without this
   * changing at all — the browser scales the whole 0-120 coordinate
   * space to fit whatever CSS size the outer box class asks for.
   */
  const figureSize = compact ? 30 : 62

  return (
    <div className={cn('relative shrink-0', boxClass, className)}>
      <svg
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        className="h-full w-full"
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
          **The figure is a different figure at each band.** It was one
          silhouette gaining marks — a mantle, then plates, then an arc —
          and the report was that it was not dramatic enough, which it
          was not: on a 120-pixel disc those are small changes to an
          unchanged outline.

          `figures.ts` says where the art comes from and what its licence
          asks for. What it must not become is a *depiction of a thing
          you own*: gear is user-typed titles, so drawing one means
          guessing what it depicts. A rank is the app's own number, and
          these are five pictures of it.

          Nested rather than transformed, so the icon keeps its own
          512-unit box and only the frame here decides where it sits.
        */}
        <svg
          x={CENTRE - figureSize / 2}
          y={CENTRE - figureSize / 2}
          width={figureSize}
          height={figureSize}
          viewBox="0 0 512 512"
        >
          <path d={figure.path} fill={figureFill} />
        </svg>
      </svg>

      {/* Outside the SVG so it uses the app's own type rather than SVG
          text metrics, which do not respect the user's font settings. */}
      <span
        className={cn(
          'bg-ink-950 text-ink-50 numeric absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border px-2 font-semibold',
          compact ? 'text-[10px]' : 'text-xs',
          size === 'large' && 'lg:-bottom-2 lg:px-3 lg:text-base',
        )}
        style={{ borderColor: tint }}
      >
        {avatar.level}
      </span>
    </div>
  )
}
