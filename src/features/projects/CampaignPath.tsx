import type { CSSProperties } from 'react'

import type { StageStanding } from '@/domain/campaign/campaign'

/**
 * The arc's stages, drawn as a road rather than read as "2 of 6".
 *
 * **`lg` and up only**, in the arc's own quest slot — the same reasoning
 * as `MainLifts`: a second reading of data `ArcSlot` already has, not a
 * new fetch.
 *
 * **HTML dots rather than a stretched SVG, and that reverses the first
 * version.** A single SVG scaled with `preserveAspectRatio="none"` to
 * fill whatever width the card happens to render at stretches the X axis
 * only — a circle drawn small enough to fit a handful of stages was
 * quietly rendering as a wide ellipse the moment the card was wider than
 * that. Fixed-size HTML circles cannot do that: a dot is `size-3.5
 * rounded-full` regardless of how wide its flex cell is.
 *
 * **Named now, not just dotted.** Asked for directly — *"don't be afraid
 * to stretch things out."* The first version deliberately carried no
 * label, reasoning that the "stage N of M" line above already named the
 * *current* one — true, and it left five-sixths of a six-stage arc
 * unnamed. Each dot gets its own stage name underneath, truncated to its
 * own flex cell rather than the row's, so a long name cannot push a
 * short one's dot out of alignment with the line.
 *
 * **Ordered but not gated, read honestly.** A later stage can be met
 * before an earlier one, so a dot's fill is `met`, never "reached": the
 * road can light up out of order, and it does whenever the underlying
 * arc does.
 *
 * **Unproven is its own mark, not a blank.** A stage nothing has been
 * recorded to judge — a net-worth target with no finance reading yet —
 * is neither met nor failed, so it gets a dashed ring rather than either
 * of the other two states standing in for "no answer".
 */

function dotColor(standing: StageStanding, isNext: boolean): string {
  if (standing.met) return 'var(--color-good-500)'
  if (isNext) return 'var(--color-accent-500)'
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

  return (
    <div
      className="relative mt-3 hidden lg:block"
      role="img"
      aria-label={`${String(stages.filter((one) => one.met).length)} of ${String(stages.length)} stages met`}
    >
      {/* The road, under every dot — a single line the row of dots sits
          on top of, rather than one segment per gap that would have to
          agree with the dots on exactly where they land. */}
      <div
        aria-hidden
        className="bg-ink-800 absolute top-[7px] right-[calc(50%/var(--stage-count))] left-[calc(50%/var(--stage-count))] h-px"
        style={{ '--stage-count': stages.length } as CSSProperties}
      />

      <div className="relative flex items-start">
        {stages.map((standing, index) => {
          const isNext = nextPosition === index + 1
          const color = dotColor(standing, isNext)
          return (
            <div key={standing.stage.id} className="flex min-w-0 flex-1 flex-col items-center">
              <span
                aria-hidden
                className="size-3.5 shrink-0 rounded-full border-2"
                style={{
                  borderColor: color,
                  backgroundColor: standing.met || isNext ? color : 'transparent',
                  borderStyle: !standing.met && standing.unproven ? 'dashed' : 'solid',
                }}
              />
              <span className="text-ink-600 mt-1.5 max-w-full truncate px-0.5 text-[10px]">
                {standing.stage.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
