/**
 * One press of a stepper: onto the step's grid in the direction pressed.
 *
 * From a number already on the grid, one step; from one off it, to the
 * nearest grid line that way — 317 goes up to 320 and down to 315, where
 * adding five would give 322 and a load no plate set builds. Never below
 * `min`, and tidied to two places so 2.5 steps do not drift.
 */
export function stepValue(current: number, direction: 1 | -1, step: number, min = 0): number {
  const units = current / step
  const onGrid = Math.abs(units - Math.round(units)) < 1e-9
  const next = onGrid
    ? current + direction * step
    : (direction > 0 ? Math.ceil(units) : Math.floor(units)) * step
  return Number(Math.max(min, next).toFixed(2))
}
