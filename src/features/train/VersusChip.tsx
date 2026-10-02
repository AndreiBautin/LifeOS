import { ArrowUp } from 'lucide-react'

import { isProgress, type Versus } from '@/domain/logging/versus-last'
import type { WeightUnit } from '@/domain/units/weight'

/**
 * What a filed set did against last time, on the row itself.
 *
 * Progress is lit and shines once as it appears; holding steady and
 * slipping back are stated in the row's quiet ink, because a set that
 * missed is information, not a failure to be flagged in red mid-session.
 */
export function VersusChip({
  versus,
  units,
}: {
  readonly versus: Versus | undefined
  readonly units: WeightUnit
}) {
  if (versus === undefined) return null
  const text = describeVersus(versus, units)
  if (!isProgress(versus)) {
    return <span className="text-ink-500 numeric text-xs whitespace-nowrap">{text}</span>
  }
  return (
    <span
      className="beat-shine bg-accent-500/15 text-accent-400 numeric relative inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
      aria-label={`${text} on last time`}
    >
      <ArrowUp size={12} aria-hidden />
      {text}
    </span>
  )
}

function describeVersus(versus: Versus, units: WeightUnit): string {
  switch (versus.kind) {
    case 'heavier':
      return `+${String(versus.by)} ${units}`
    case 'more-reps':
      return `+${String(versus.by)} ${versus.by === 1 ? 'rep' : 'reps'}`
    case 'matched':
      return 'Matched'
    case 'fewer-reps':
      return `−${String(versus.by)} ${versus.by === 1 ? 'rep' : 'reps'}`
    case 'lighter':
      return `−${String(versus.by)} ${units}`
  }
}
