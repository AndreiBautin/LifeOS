import { parseDay, shiftDay } from '@/domain/time/day'

import type { TrendPoint } from './trend'

/**
 * When a lift reaches a load, if it keeps going the way it has been.
 *
 * **A straight line through the last twelve weeks**, least squares, read
 * forward to the target. It is the simplest projection there is and it
 * says so on screen: strength does not climb in a straight line forever,
 * and the nearer the target the better the guess.
 *
 * **Silence is most of its behaviour.** Fewer than four sessions, under
 * four weeks of span, a flat or falling line, or a date more than a year
 * out all answer nothing — a projection two years away is a line drawn
 * past the edge of the evidence, and one from three points is noise with
 * a date on it.
 */
export const WINDOW_DAYS = 84
const MIN_POINTS = 4
const MIN_SPAN_DAYS = 28
const MAX_DAYS_AHEAD = 365

export function projectReach(
  points: readonly TrendPoint[],
  target: number,
  today: string,
): string | undefined {
  const last = points.at(-1)
  if (last === undefined || last.value >= target) return undefined

  const from = shiftDay(last.date, -WINDOW_DAYS)
  const window = points.filter((point) => point.date >= from)
  if (window.length < MIN_POINTS) return undefined

  const origin = parseDay(window[0]?.date ?? last.date).getTime()
  const xs = window.map((point) => (parseDay(point.date).getTime() - origin) / 86_400_000)
  const ys = window.map((point) => point.value)
  const span = (xs.at(-1) ?? 0) - (xs[0] ?? 0)
  if (span < MIN_SPAN_DAYS) return undefined

  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  const sxx = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)
  const sxy = xs.reduce((sum, x, i) => sum + (x - meanX) * ((ys[i] ?? 0) - meanY), 0)
  const slope = sxx === 0 ? 0 : sxy / sxx
  if (slope <= 0) return undefined

  // Read forward from the fitted line at the last session, not the raw
  // point, so one good day does not pull the date in.
  const fittedNow = meanY + slope * ((xs.at(-1) ?? 0) - meanX)
  const days = Math.ceil((target - fittedNow) / slope)
  const reach = shiftDay(last.date, Math.max(0, days))
  if (reach < today) return undefined
  if ((parseDay(reach).getTime() - parseDay(today).getTime()) / 86_400_000 > MAX_DAYS_AHEAD) {
    return undefined
  }
  return reach
}
