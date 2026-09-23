import type { StageStanding } from '@/domain/campaign/campaign'

/**
 * The arc's stages, drawn as a road rather than read as "2 of 6".
 *
 * **`lg` and up only**, in the arc's own quest slot — the same reasoning
 * as `TraitRadar`: a second reading of data `ArcSlot` already has, not a
 * new fetch. The existing "stage 2 of 6" line stays exactly as it is,
 * because it says which stage by *name*, which a row of dots cannot.
 *
 * **Ordered but not gated, read honestly.** A later stage can be met
 * before an earlier one — `docs/CLAUDE.md` states this as a rule, not an
 * accident — so a dot's fill is `met`, never "reached": the road can
 * light up out of order, and it does whenever the underlying arc does.
 *
 * **Unproven is its own mark, not a blank.** A stage nothing has been
 * recorded to judge — a net-worth target with no finance reading yet —
 * is neither met nor failed, so it gets a dashed ring rather than either
 * of the other two states standing in for "no answer".
 */

const DOT = 10
const GAP_MIN = 28

function dotFill(standing: StageStanding, isNext: boolean): string {
  if (standing.met) return 'var(--color-good-500)'
  if (isNext) return 'var(--color-accent-500)'
  return 'transparent'
}

function dotStroke(standing: StageStanding, isNext: boolean): string {
  if (standing.met) return 'var(--color-good-500)'
  if (isNext) return 'var(--color-accent-500)'
  if (standing.unproven) return 'var(--color-ink-700)'
  return 'var(--color-ink-700)'
}

export function CampaignPath({
  stages,
  nextPosition,
}: {
  readonly stages: readonly StageStanding[]
  /** 1-indexed, matching `CampaignStanding.nextPosition`. */
  readonly nextPosition: number | undefined
}) {
  if (stages.length < 2) return null

  const width = Math.max(120, (stages.length - 1) * GAP_MIN + DOT)
  const gap = stages.length > 1 ? (width - DOT) / (stages.length - 1) : 0
  const y = DOT / 2

  return (
    <svg
      viewBox={`0 0 ${String(width)} ${String(DOT)}`}
      className="mt-2 hidden h-2.5 w-full lg:block"
      preserveAspectRatio="none"
      role="img"
      aria-label={`${String(stages.filter((one) => one.met).length)} of ${String(stages.length)} stages met`}
    >
      {/* The road itself, under every dot, so a met stage reads as a
          filled segment of one path rather than islands. */}
      <line
        x1={DOT / 2}
        y1={y}
        x2={width - DOT / 2}
        y2={y}
        stroke="var(--color-ink-800)"
        strokeWidth={2}
      />

      {stages.map((standing, index) => {
        const isNext = nextPosition === index + 1
        return (
          <circle
            key={standing.stage.id}
            cx={DOT / 2 + index * gap}
            cy={y}
            r={DOT / 2}
            fill={dotFill(standing, isNext)}
            stroke={dotStroke(standing, isNext)}
            strokeWidth={1.5}
            strokeDasharray={!standing.met && standing.unproven ? '2 2' : undefined}
          />
        )
      })}
    </svg>
  )
}
