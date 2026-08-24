import { DomainError, invariant } from '@/domain/errors/domain-error'

export type WeightUnit = 'lb' | 'kg'

/**
 * What a bar can actually be loaded to.
 *
 * A prescription of "72.5% of a 315 lb training max" is 228.375 lb, which
 * no gym contains. Rounding is therefore part of the prescription, not a
 * display concern: the number shown must be the number lifted, or the
 * logged history drifts from the plan by a few pounds a week.
 *
 * The increment is a program setting rather than a constant because it
 * depends on the equipment. Barbell work with standard plates rounds to
 * 5 lb; a dumbbell rack may only offer 5 lb steps; a machine with a
 * weight stack has its own pin spacing; microplates make 1 lb sensible.
 */
export const DEFAULT_INCREMENT: Record<WeightUnit, number> = { lb: 5, kg: 2.5 }

export type RoundingMode = 'nearest' | 'down' | 'up'

export function roundLoad(
  value: number,
  increment: number,
  mode: RoundingMode = 'nearest',
): number {
  invariant(
    Number.isFinite(increment) && increment > 0,
    'ROUNDING_INCREMENT_INVALID',
    `Rounding increment must be a positive number, received ${String(increment)}.`,
  )
  invariant(
    Number.isFinite(value),
    'LOAD_NOT_FINITE',
    `Cannot round a non-finite load (${String(value)}).`,
  )

  const steps = value / increment
  const rounded =
    mode === 'down' ? Math.floor(steps) : mode === 'up' ? Math.ceil(steps) : Math.round(steps)

  // Rounding the product too avoids 47.5 * 3 landing on 142.49999999999997
  // and rendering as "142.5" in one place and "142.49" in another.
  return Number((rounded * increment).toFixed(4))
}

const LB_PER_KG = 2.2046226218

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) return value
  return from === 'kg' ? value * LB_PER_KG : value / LB_PER_KG
}

/**
 * Formats a load for display, dropping a trailing `.0` so 135 reads as
 * "135" and 137.5 reads as "137.5". LiftTracker did this inline in three
 * separate Razor templates with three slightly different expressions.
 */
export function formatLoad(value: number, unit: WeightUnit): string {
  const rounded = Number(value.toFixed(2))
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text} ${unit}`
}

export function assertPositiveLoad(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainError(
      `Load must be a non-negative number, received ${String(value)}.`,
      'LOAD_NEGATIVE',
    )
  }
  return value
}
