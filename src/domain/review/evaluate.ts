import type { RatingOutcome } from '@/domain/game/rating'

import type { MetricDefinition } from './metric'

/**
 * The five ways a number can be judged, and the four answers they give.
 *
 * Five classes behind a factory in the source, one exhaustive switch here.
 * The factory existed so a sixth strategy could be registered without
 * touching a dispatcher; a discriminated union does the same job in
 * TypeScript and does it better — adding a direction fails the build at
 * this switch until the case is handled, which is a stronger guarantee
 * than remembering to register something.
 *
 * The outcomes are `domain/game/rating.ts`'s, unchanged. That was decided
 * in phase 0 precisely so this port would land on them rather than beside
 * them: two spellings of the same four values, translated at a boundary,
 * is where an off-by-one lives.
 */

/**
 * The latest reading against the one before it.
 *
 * Two readings, not a trend line. The source compared exactly the last two
 * and this keeps that: a monthly review answers "how was this month
 * against last month", and a smoothed trend would answer a different
 * question while looking like the same one.
 */
export function evaluate(metric: MetricDefinition, values: readonly number[]): RatingOutcome {
  if (values.length < 2) return 'insufficient-data'

  const previous = values[values.length - 2]
  const latest = values[values.length - 1]
  if (previous === undefined || latest === undefined) return 'insufficient-data'

  switch (metric.direction) {
    case 'increase':
      if (latest > previous) return 'improved'
      return latest < previous ? 'regressed' : 'stagnant'

    case 'decrease':
      if (latest < previous) return 'improved'
      return latest > previous ? 'regressed' : 'stagnant'

    /*
     * A threshold metric is judged on which side of the line it is, not on
     * which way it moved. A credit score that fell twenty points and is
     * still above the line has not regressed — that is the whole reason
     * this is a separate direction rather than `increase` with a note.
     */
    case 'stay-above': {
      const threshold = metric.threshold ?? 0
      if (latest < threshold) return 'regressed'
      return previous < threshold ? 'improved' : 'stagnant'
    }

    case 'stay-below': {
      const threshold = metric.threshold ?? 0
      if (latest > threshold) return 'regressed'
      return previous > threshold ? 'improved' : 'stagnant'
    }

    case 'stay-within-range': {
      const { min, max } = metric.range ?? { min: 0, max: 0 }
      const latestInside = latest >= min && latest <= max
      if (!latestInside) return 'regressed'

      const previousInside = previous >= min && previous <= max
      return previousInside ? 'stagnant' : 'improved'
    }
  }
}
